import { ADULT_CONTENT_BLOCKED } from "@/lib/contentPolicy";
import { stripProtected } from "@/lib/workPropagation";
import type { CatalogEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { markCancelled, startExclusiveJob } from "@/lib/jobLock";
import { getMediaForCuration, type CurationMedia } from "@/lib/anilist";
import { siteScoreOf } from "@/lib/siteScore";
import { recomputeSiteScore } from "@/lib/siteScoreDb";
import { curateEntry, CURATION_VERSION } from "./curateEntry";
import { AUDIT_CODES, ISSUE_CODES } from "./issues";
import { loadAnidbGenres } from "./anidbGenres";

/** Obras por consulta à AniList (a AniList limita a complexidade da consulta, que aqui traz etiquetas e relações). */
export const CURATION_BATCH = 50;
const FETCH_RETRIES = 3;
const STALE_AFTER_MS = 10 * 60 * 1000;

export type CurationProgress = {
  /** Parou a pedido (Fase 8). */
  cancelled?: boolean;
  version: number;
  /** Obras da plataforma. */
  total: number;
  /** Já curadas na versão atual das regras (inclui as de execuções anteriores). */
  done: number;
  startedAt: string;
  updatedAt: string;
  finished: boolean;
  /** O que a curadoria preencheu/corrigiu nesta execução, por campo. */
  changed: Record<string, number>;
  /** Obras desta execução por tipo (EPISODE, OVA, ODA, MOVIE, OTHER, UNKNOWN). */
  kinds: Record<string, number>;
  /** Pendências abertas por motivo, contadas nesta execução. */
  issues: Record<string, number>;
  adultRemoved: number;
  /** Lotes que a AniList não respondeu (ficam para a próxima execução). */
  failedBatches: number;
  /** Quantas obras já tinham sinopse em português/japonês guardadas. */
  withPt: number;
  withJa: number;
  currentTitle: string | null;
};

const emptyProgress = (total: number, done: number): CurationProgress => ({
  version: CURATION_VERSION,
  total,
  done,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  finished: false,
  changed: {},
  kinds: {},
  issues: {},
  adultRemoved: 0,
  failedBatches: 0,
  withPt: 0,
  withJa: 0,
  currentTitle: null,
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchMedia(ids: number[]): Promise<Map<number, CurationMedia> | null> {
  if (ids.length === 0) return new Map();
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      return new Map((await getMediaForCuration(ids)).map((m) => [m.id, m]));
    } catch (error) {
      console.error(`[curadoria] AniList falhou (tentativa ${attempt}/${FETCH_RETRIES}):`, (error as Error).message.slice(0, 160));
      if (attempt < FETCH_RETRIES) await sleep(2000 * attempt);
    }
  }
  return null;
}

async function syncIssues(entry: CatalogEntry, issues: Array<{ code: string; detail?: string }>): Promise<void> {
  const codes = issues.map((i) => i.code);
  const now = new Date();
  // As pendências da auditoria das linhas do tempo (AUDIT_CODES) pertencem a ela: a curadoria não as fecha.
  // A condição sumiu: resolvida (inclusive a ignorada — se voltar, reabre como nova ocorrência).
  await prisma.curationIssue.updateMany({ where: { entryId: entry.id, status: { in: ["OPEN", "DISMISSED"] }, code: { notIn: [...codes, ...AUDIT_CODES] } }, data: { status: "RESOLVED", resolvedAt: now } });
  const existing = new Map((await prisma.curationIssue.findMany({ where: { entryId: entry.id, code: { in: codes } }, select: { code: true, status: true } })).map((i) => [i.code, i.status]));
  for (const issue of issues) {
    const common = { anilistId: entry.anilistId, anidbId: entry.anidbId, title: entry.titleRomaji, detail: issue.detail ?? null };
    const status = existing.get(issue.code);
    if (status === undefined) {
      await prisma.curationIssue.create({ data: { entryId: entry.id, code: issue.code, ...common } });
    } else if (status === "RESOLVED") {
      // O problema reapareceu (Fase 7): reabre e conta a recorrência.
      await prisma.curationIssue.update({ where: { entryId_code: { entryId: entry.id, code: issue.code } }, data: { ...common, status: "OPEN", resolvedAt: null, reopenCount: { increment: 1 } } });
    } else {
      // Aberta continua aberta; ignorada com justificativa continua ignorada enquanto a condição for a mesma.
      await prisma.curationIssue.update({ where: { entryId_code: { entryId: entry.id, code: issue.code } }, data: common });
    }
  }
}

async function curateOne(
  entry: CatalogEntry,
  media: CurationMedia | null,
  translations: { pt?: string; ja?: string },
  score: { score: number; votes: number },
  anidbGenres: string[],
  progress: CurationProgress
): Promise<void> {
  const result = curateEntry({ entry, media, translations, anidbGenres });
  // Campos corrigidos à mão (Fase 3) ficam como o admin deixou.
  result.patch = stripProtected(result.patch, entry.manualFields);
  // Sinopse em português vinda do cache de traduções: é automática (Fase 7).
  const ptStatus = result.patch.descriptionPt && result.patch.descriptionPt !== entry.descriptionPt ? { descriptionPtStatus: "AUTO" } : {};
  await prisma.catalogEntry.update({
    where: { id: entry.id },
    data: { ...result.patch, ...ptStatus, siteScore: score.score, siteScoreVotes: score.votes, curatedAt: new Date(), curationVersion: CURATION_VERSION, ...(result.adult && ADULT_CONTENT_BLOCKED ? { onPlatform: false } : {}) },
  });

  // O que é derivado também vai para as cópias da obra (produção, lista de cada pessoa, calendário).
  if (entry.anilistId !== null) {
    if (result.patch.genres !== null && result.patch.genres !== entry.genres) {
      await Promise.all([
        prisma.production.updateMany({ where: { anilistId: entry.anilistId }, data: { genres: result.patch.genres } }),
        prisma.anime.updateMany({ where: { anilistId: entry.anilistId }, data: { genres: result.patch.genres } }),
        prisma.airingScheduleEntry.updateMany({ where: { anilistId: entry.anilistId }, data: { genres: result.patch.genres } }),
      ]);
    }
    if (result.patch.officialSite) await prisma.anime.updateMany({ where: { anilistId: entry.anilistId, officialSite: null }, data: { officialSite: result.patch.officialSite } });
  }

  await syncIssues(entry, result.issues);

  for (const field of result.changed) progress.changed[field] = (progress.changed[field] ?? 0) + 1;
  const kind = result.patch.kind ?? "UNKNOWN";
  progress.kinds[kind] = (progress.kinds[kind] ?? 0) + 1;
  for (const issue of result.issues) progress.issues[issue.code] = (progress.issues[issue.code] ?? 0) + 1;
  if (result.adult && ADULT_CONTENT_BLOCKED) progress.adultRemoved += 1;
  if (result.patch.descriptionPt) progress.withPt += 1;
  if (result.patch.descriptionJa) progress.withJa += 1;
  progress.currentTitle = entry.titleRomaji;
}

/**
 * Obras que ainda precisam da curadoria na versão atual das regras (ou todas, com `force`). Com `anilistIds`, só essas obras
 * (sempre refeitas): serve para curar de novo uma obra isolada.
 */
async function pendingIds(force: boolean, anilistIds?: number[]): Promise<string[]> {
  const where = anilistIds ? { onPlatform: true, anilistId: { in: anilistIds } } : { onPlatform: true, ...(force ? {} : { curationVersion: { lt: CURATION_VERSION } }) };
  const rows = await prisma.catalogEntry.findMany({ where, select: { id: true }, orderBy: { id: "asc" } });
  return rows.map((r) => r.id);
}

export async function runCuration(
  seq: number,
  { force = false, limit, anilistIds, onBatch }: { force?: boolean; limit?: number; anilistIds?: number[]; onBatch?: (progress: CurationProgress) => void } = {}
): Promise<CurationProgress> {
  const all = await pendingIds(force, anilistIds);
  // Uma execução de obras escolhidas mede só o próprio lote; a do catálogo inteiro mede contra todas as obras da plataforma.
  const total = anilistIds ? all.length : await prisma.catalogEntry.count({ where: { onPlatform: true } });
  const ids = limit ? all.slice(0, limit) : all;
  const progress = emptyProgress(total, anilistIds ? 0 : total - all.length);
  // Sinal de vida a cada passo (Fase 8): a trava de concorrência sabe que o job está vivo, e o pedido de cancelamento
  // é visto aqui.
  let cancelRequested = false;
  const save = async (note: string) => {
    progress.updatedAt = new Date().toISOString();
    const job = await prisma.adminJob.update({ where: { seq }, data: { processed: progress.done, total, progressNote: note, resultJson: JSON.stringify(progress), heartbeatAt: new Date() }, select: { cancelRequestedAt: true } }).catch(() => null);
    cancelRequested = Boolean(job?.cancelRequestedAt);
    onBatch?.(progress);
  };
  await save(`Preparando a curadoria de ${ids.length} obras…`);
  // Gêneros do AniDB relidos do HTML das cargas com o vocabulário atual (só quando há obras para curar).
  const anidbGenres = ids.length ? await loadAnidbGenres() : new Map<number, string[]>();

  for (let start = 0; start < ids.length; start += CURATION_BATCH) {
    if (cancelRequested) {
      progress.cancelled = true;
      break;
    }
    const entries = await prisma.catalogEntry.findMany({ where: { id: { in: ids.slice(start, start + CURATION_BATCH) } }, orderBy: { id: "asc" } });
    const anilistIds = entries.map((e) => e.anilistId).filter((x): x is number => x !== null);
    const media = await fetchMedia(anilistIds);
    if (media === null) {
      progress.failedBatches += 1;
      await save(`A AniList não respondeu para um lote (${progress.failedBatches}); segue com o próximo.`);
      continue;
    }
    const translationRows = anilistIds.length ? await prisma.synopsisTranslation.findMany({ where: { anilistId: { in: anilistIds } }, select: { anilistId: true, lang: true, text: true } }) : [];
    const translations = new Map<number, { pt?: string; ja?: string }>();
    for (const row of translationRows) translations.set(row.anilistId, { ...translations.get(row.anilistId), [row.lang]: row.text });
    const votes = anilistIds.length
      ? await prisma.anime.findMany({ where: { anilistId: { in: anilistIds }, userScore: { not: null }, watchState: "FINISHED" }, select: { anilistId: true, userScore: true } })
      : [];
    const scoresByWork = new Map<number, number[]>();
    for (const v of votes) scoresByWork.set(v.anilistId, [...(scoresByWork.get(v.anilistId) ?? []), v.userScore as number]);

    for (const entry of entries) {
      const found = entry.anilistId !== null ? media.get(entry.anilistId) ?? null : null;
      const score = siteScoreOf(entry.anilistId !== null ? scoresByWork.get(entry.anilistId) ?? [] : []);
      await curateOne(entry, found, entry.anilistId !== null ? translations.get(entry.anilistId) ?? {} : {}, score, entry.anidbId !== null ? anidbGenres.get(entry.anidbId) ?? [] : [], progress);
      progress.done += 1;
    }
    await save(`Curando o catálogo: ${progress.done} de ${total}`);
  }

  progress.finished = true;
  progress.currentTitle = null;
  return progress;
}

/** Cria o job de curadoria (kind CURATION) e devolve o número dele. Recusa se já houver um rodando. */
export async function createCurationJob(actor: { id: string; name: string }): Promise<{ seq: number } | { running: number }> {
  // Um por vez, de forma atômica (Fase 8, `jobLock`); um job sem sinal de vida é dado como interrompido.
  const started = await startExclusiveJob("CURATION", { source: "Catálogo", season: `Curadoria v${CURATION_VERSION}`, stage: "COMMIT", progressNote: "Iniciando…", adminId: actor.id, adminName: actor.name }, STALE_AFTER_MS);
  return started.ok ? { seq: started.job.seq } : { running: started.running.seq };
}

/** Roda a curadoria inteira como job auditável (SUCCESS com o resumo, ou FAILED com o motivo). */
export async function curateCatalog({
  actor,
  force = false,
  limit,
  anilistIds,
  onBatch,
}: {
  actor: { id: string; name: string };
  force?: boolean;
  limit?: number;
  anilistIds?: number[];
  onBatch?: (p: CurationProgress) => void;
}): Promise<CurationProgress | { running: number }> {
  const created = await createCurationJob(actor);
  if ("running" in created) return created;
  try {
    const progress = await runCuration(created.seq, { force, limit, anilistIds, onBatch });
    if (progress.cancelled) {
      await markCancelled(created.seq, `Cancelado a pedido depois de ${progress.done} obra(s); o que já foi curado fica (rodar de novo continua daí).`);
      return progress;
    }
    await prisma.adminJob.update({
      where: { seq: created.seq },
      data: { state: "SUCCESS", stage: "NOTIFICATION", progressNote: null, processed: progress.done, total: progress.total, finishedAt: new Date(), resultJson: JSON.stringify(progress) },
    });
    return progress;
  } catch (error) {
    await prisma.adminJob
      .update({ where: { seq: created.seq }, data: { state: "FAILED", progressNote: null, finishedAt: new Date(), error: error instanceof Error ? error.message.slice(0, 300) : "Falha inesperada." } })
      .catch(() => undefined);
    throw error;
  }
}

export { recomputeSiteScore };

export type CurationStatus = {
  job: { seq: number; state: string; error: string | null; createdAt: string; finishedAt: string | null; progressNote: string | null } | null;
  progress: CurationProgress | null;
  /** Obras da plataforma e quantas já estão curadas na versão atual. */
  total: number;
  curated: number;
  /** Pendências abertas por motivo (todas as obras, não só esta execução). */
  openIssues: Record<string, number>;
  /** Obras por tipo no catálogo inteiro. */
  kinds: Record<string, number>;
};

export async function getCurationStatus(): Promise<CurationStatus> {
  const [job, total, curated, issueRows, kindRows] = await Promise.all([
    prisma.adminJob.findFirst({ where: { kind: "CURATION" }, orderBy: { seq: "desc" } }),
    prisma.catalogEntry.count({ where: { onPlatform: true } }),
    prisma.catalogEntry.count({ where: { onPlatform: true, curationVersion: { gte: CURATION_VERSION } } }),
    prisma.curationIssue.groupBy({ by: ["code"], where: { status: "OPEN" }, _count: true }),
    prisma.catalogEntry.groupBy({ by: ["kind"], where: { onPlatform: true }, _count: true }),
  ]);
  const openIssues: Record<string, number> = Object.fromEntries(ISSUE_CODES.map((c) => [c, 0]));
  for (const row of issueRows) openIssues[row.code] = row._count;
  const kinds: Record<string, number> = {};
  for (const row of kindRows) kinds[row.kind ?? "UNKNOWN"] = row._count;
  let progress: CurationProgress | null = null;
  try {
    progress = job?.resultJson ? (JSON.parse(job.resultJson) as CurationProgress) : null;
  } catch {
    progress = null;
  }
  return {
    job: job ? { seq: job.seq, state: job.state, error: job.error, createdAt: job.createdAt.toISOString(), finishedAt: job.finishedAt?.toISOString() ?? null, progressNote: job.progressNote } : null,
    progress,
    total,
    curated,
    openIssues,
    kinds,
  };
}
