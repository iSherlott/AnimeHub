import type { AdminJob, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EXCLUSIVE_KINDS, lastSignal } from "@/lib/jobLock";

/**
 * Admin → Jobs (Fase 8, §15): todos os processos numa visão só — os jobs do painel (`AdminJob`: importação, AniList,
 * curadoria, linhas do tempo, tradução, atualização seletiva) e as execuções dos serviços de fundo (agenda, avisos,
 * notícias, imagens). Para cada tipo: última execução, última com sucesso e a próxima (quando há agenda).
 */
export const JOB_KINDS = {
  IMPORT: { label: "Importação (HTML do AniDB)", where: "/admin/importacoes", rerun: "Analise o HTML de novo em Importações (ou Tentar novamente no job com falha).", idempotent: "Sim: o commit é único por lote; nova tentativa cria outro job." },
  ANILIST: { label: "AniList (trazer/complementar)", where: "/admin/importacoes", rerun: "Repita a seleção no painel da AniList.", idempotent: "Sim: grava por upsert; repetir não duplica." },
  CURATION: { label: "Curadoria", where: "/admin/curadoria", rerun: "Rode a curadoria de novo: continua das obras que faltam.", idempotent: "Sim: retomável; campos protegidos não mudam." },
  TIMELINE: { label: "Linhas do tempo e nomes", where: "/admin/curadoria", rerun: "Rode a auditoria de novo.", idempotent: "Sim: recalcula; ordem manual não muda." },
  TRANSLATION: { label: "Tradução das sinopses", where: "/admin/curadoria", rerun: "Rode a tradução de novo: pula o que já está traduzido.", idempotent: "Sim: retomável; revisadas e manuais não mudam." },
  FIELD_UPDATE: { label: "Atualização seletiva", where: "/admin/atualizacoes", rerun: "Abra o lote e use Reprocessar falhas.", idempotent: "Sim: confere o valor da coleta antes de gravar." },
} as const;
export type JobKind = keyof typeof JOB_KINDS;
export const jobKindLabel = (kind: string) => JOB_KINDS[kind as JobKind]?.label ?? kind;

export type JobFilters = { tipo: string; estado: string; periodo: string; q: string; falhas: boolean; pagina: number };
export const JOBS_PAGE_SIZE = 50;

export function parseJobFilters(sp: Record<string, string | undefined> | URLSearchParams): JobFilters {
  const get = (n: string) => ((sp instanceof URLSearchParams ? sp.get(n) : sp[n]) ?? "").trim();
  return {
    tipo: get("tipo") in JOB_KINDS ? get("tipo") : "",
    estado: ["PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED"].includes(get("estado")) ? get("estado") : "",
    periodo: ["hoje", "7d", "30d"].includes(get("periodo")) ? get("periodo") : "",
    q: get("q").slice(0, 60),
    falhas: get("falhas") === "1",
    pagina: Math.max(0, Math.min(10_000, Number(get("pagina")) || 0)),
  };
}

export function jobsWhere(f: JobFilters, since: Date | null): Prisma.AdminJobWhereInput {
  const asSeq = /^#?\d{1,9}$/.test(f.q) ? Number(f.q.replace("#", "")) : null;
  return {
    ...(f.tipo ? { kind: f.tipo } : {}),
    ...(f.falhas ? { state: "FAILED" } : f.estado ? { state: f.estado } : {}),
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(f.q ? { OR: [{ source: { contains: f.q, mode: "insensitive" } }, { season: { contains: f.q, mode: "insensitive" } }, { adminName: { contains: f.q, mode: "insensitive" } }, ...(asSeq !== null ? [{ seq: asSeq }] : [])] } : {}),
  };
}

/** Duração: até o fim, ou até agora se ainda roda. */
export function durationMs(job: Pick<AdminJob, "createdAt" | "finishedAt">, now: Date = new Date()): number {
  return (job.finishedAt ?? now).getTime() - job.createdAt.getTime();
}

export function fmtDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

/** Sucessos e falhas de um job, a partir do resultado guardado (cada tipo grava o seu resumo). */
export function jobOutcome(job: Pick<AdminJob, "kind" | "resultJson" | "processed" | "state">): { ok: number | null; failed: number | null } {
  if (!job.resultJson) return { ok: null, failed: job.state === "FAILED" ? 1 : null };
  try {
    const r = JSON.parse(job.resultJson) as Record<string, unknown>;
    const num = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : null);
    switch (job.kind) {
      case "FIELD_UPDATE":
        return { ok: num("applied"), failed: (num("failed") ?? 0) + (num("conflicts") ?? 0) };
      case "TRANSLATION":
        return { ok: num("translated"), failed: num("failed") };
      case "CURATION":
        return { ok: num("done"), failed: num("failedBatches") };
      case "ANILIST":
        return { ok: num("brought") ?? num("updated") ?? num("works"), failed: num("notFound") };
      default:
        return { ok: job.processed || null, failed: null };
    }
  } catch {
    return { ok: null, failed: null };
  }
}

/** Resumo por tipo: última execução, última com sucesso, em execução agora (com sinal de vida). */
export async function kindSummaries() {
  const kinds = Object.keys(JOB_KINDS) as JobKind[];
  return Promise.all(
    kinds.map(async (kind) => {
      const [last, lastOk, running, failed24h] = await Promise.all([
        prisma.adminJob.findFirst({ where: { kind }, orderBy: { seq: "desc" } }),
        prisma.adminJob.findFirst({ where: { kind, state: "SUCCESS" }, orderBy: { seq: "desc" } }),
        prisma.adminJob.findFirst({ where: { kind, state: "RUNNING" }, orderBy: { seq: "desc" } }),
        prisma.adminJob.count({ where: { kind, state: "FAILED", createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
      ]);
      return { kind, label: JOB_KINDS[kind].label, last, lastOk, running, runningSignal: running ? lastSignal(running) : null, exclusive: (EXCLUSIVE_KINDS as readonly string[]).includes(kind), failed24h };
    })
  );
}

/** Serviços de fundo: intervalo conhecido (para a próxima execução estimada). */
export const SERVICES = {
  "calendar-loader": { label: "Carregador da agenda (AniList)", everyMs: 30 * 60_000 },
  notifier: { label: "Avisos de lançamento (sino)", everyMs: 2 * 60_000 },
} as const;

export async function serviceSummaries(now: Date = new Date()) {
  const ingestion = await Promise.all(
    (Object.keys(SERVICES) as Array<keyof typeof SERVICES>).map(async (source) => {
      const [last, lastOk, failures] = await Promise.all([
        prisma.ingestionRun.findFirst({ where: { source }, orderBy: { startedAt: "desc" } }),
        prisma.ingestionRun.findFirst({ where: { source, status: "OK" }, orderBy: { startedAt: "desc" } }),
        prisma.ingestionRun.count({ where: { source, status: "ERROR", startedAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
      ]);
      const next = last ? new Date(last.startedAt.getTime() + SERVICES[source].everyMs) : null;
      return { key: source, label: SERVICES[source].label, lastAt: last?.startedAt ?? null, lastStatus: last?.status ?? null, lastMessage: last?.message ?? null, lastOkAt: lastOk?.startedAt ?? null, processed: last?.itemsProcessed ?? null, failedItems: last?.itemsFailed ?? null, failures24h: failures, nextAt: next, late: next !== null && now.getTime() - next.getTime() > SERVICES[source].everyMs };
    })
  );
  const [news, newsOk, images, imagesOk] = await Promise.all([
    prisma.newsRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.newsRun.findFirst({ where: { status: "OK" }, orderBy: { startedAt: "desc" } }),
    prisma.episodeImageRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.episodeImageRun.findFirst({ where: { status: "OK" }, orderBy: { startedAt: "desc" } }),
  ]);
  const midnight = new Date(now);
  midnight.setUTCHours(27, 0, 0, 0); // 00:00 em São Paulo (UTC-3) do dia seguinte: o job diário de imagens
  return [
    ...ingestion,
    { key: "news", label: "Notícias (RSS)", lastAt: news?.startedAt ?? null, lastStatus: news?.status ?? null, lastMessage: news?.message ?? null, lastOkAt: newsOk?.startedAt ?? null, processed: news?.fetched ?? null, failedItems: news?.failed ?? null, failures24h: null, nextAt: null, late: false },
    { key: "episode-images", label: "Imagens dos episódios (Kitsu, diário)", lastAt: images?.startedAt ?? null, lastStatus: images?.status ?? null, lastMessage: images?.message ?? null, lastOkAt: imagesOk?.startedAt ?? null, processed: images?.found ?? null, failedItems: images?.failed ?? null, failures24h: null, nextAt: midnight, late: false },
  ];
}

/** Tentativas anteriores do mesmo tipo (e, na importação, do mesmo lote de origem). */
export async function previousAttempts(job: AdminJob) {
  return prisma.adminJob.findMany({ where: { kind: job.kind, seq: { lt: job.seq }, ...(job.kind === "IMPORT" ? { season: job.season } : {}) }, orderBy: { seq: "desc" }, take: 5, select: { seq: true, state: true, createdAt: true, finishedAt: true, error: true } });
}

export function jobsCsv(jobs: AdminJob[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = "job,tipo,estado,etapa,inicio,fim,duracao_s,processados,total,responsavel,erro";
  return [header, ...jobs.map((j) => [j.seq, j.kind, j.state, j.stage, j.createdAt.toISOString(), j.finishedAt?.toISOString(), Math.round(durationMs(j) / 1000), j.processed, j.total, j.adminName, j.error].map(esc).join(","))].join("\n");
}
