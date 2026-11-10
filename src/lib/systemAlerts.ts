import { prisma } from "@/lib/prisma";

/**
 * Avisos do sistema para a administração (10/11/2026): um serviço de fundo ou um job que falhou, ou um serviço que parou
 * de rodar. Os serviços já registram cada execução (IngestionRun, NewsRun, EpisodeImageRun, AdminJob); aqui só se olha
 * esse registro quando o sino de um admin é consultado e se cria um aviso por problema (a `key` impede repetir).
 */

/** Só olha o que aconteceu nestes dias: um problema antigo, já resolvido, não vira aviso novo. */
const LOOKBACK_MS = 2 * 24 * 3600 * 1000;
/** Avisos mais antigos que isto saem do sino. */
const KEEP_MS = 14 * 24 * 3600 * 1000;
/** Entre duas varreduras (o sino de cada admin consulta a cada minuto). */
const SCAN_GAP_MS = Number(process.env.SYSTEM_ALERTS_SCAN_GAP_MS ?? 60 * 1000);

/**
 * Serviço que roda sozinho de tempos em tempos: se ele rodou nos últimos 7 dias mas não roda há mais que `staleAfterMs`,
 * parou (caiu, ficou sem banco…). Quem nunca rodou aqui (ambiente sem o serviço) não vira aviso.
 */
export const WATCHED_SERVICES: { source: string; label: string; staleAfterMs: number }[] = [
  { source: "notifier", label: "Avisos de lançamento (notifier)", staleAfterMs: 30 * 60 * 1000 },
  { source: "calendar-loader", label: "Calendário (calendar-loader)", staleAfterMs: 3 * 3600 * 1000 },
];
const NEWS_STALE_MS = 36 * 3600 * 1000;
const RECENT_ACTIVITY_MS = 7 * 24 * 3600 * 1000;

export type SystemAlertDraft = { key: string; source: string; title: string; message: string | null; href: string | null };

type RunRow = { id: string; status: string; startedAt: Date; message: string | null };

/** Execução com erro vira aviso (PARTIAL não: parte entrou, e o painel já mostra o detalhe). */
export function failedRunAlerts(source: string, label: string, href: string, runs: RunRow[]): SystemAlertDraft[] {
  return runs
    .filter((r) => r.status === "ERROR")
    .map((r) => ({ key: `${source}:${r.id}`, source, title: `${label} falhou`, message: r.message ? r.message.slice(0, 300) : null, href }));
}

/** Serviço que parou: um aviso por dia (a chave leva a data), para não repetir a cada minuto nem sumir para sempre. */
export function staleServiceAlert(
  service: { source: string; label: string; staleAfterMs: number },
  lastRunAt: Date | null,
  hadRecentActivity: boolean,
  now: Date
): SystemAlertDraft | null {
  if (!lastRunAt || !hadRecentActivity) return null;
  const idleMs = now.getTime() - lastRunAt.getTime();
  if (idleMs <= service.staleAfterMs) return null;
  const hours = Math.floor(idleMs / 3600_000);
  const minutes = Math.floor(idleMs / 60_000);
  const since = hours >= 1 ? `${hours} h` : `${minutes} min`;
  return {
    key: `stale:${service.source}:${now.toISOString().slice(0, 10)}`,
    source: service.source,
    title: `${service.label} parou de rodar`,
    message: `A última execução foi há ${since}. Confira se o serviço está no ar.`,
    href: "/admin/jobs",
  };
}

let lastScanAt = 0;

/** Para os testes: a próxima consulta varre de novo, sem esperar o intervalo. */
export function resetSystemAlertScan(): void {
  lastScanAt = 0;
}

/** Varre os registros e grava os avisos novos. Nunca lança: o sino não pode cair por causa disso. */
export async function ensureSystemAlerts(now = new Date()): Promise<void> {
  if (now.getTime() - lastScanAt < SCAN_GAP_MS) return;
  lastScanAt = now.getTime();
  try {
    const since = new Date(now.getTime() - LOOKBACK_MS);
    const recent = new Date(now.getTime() - RECENT_ACTIVITY_MS);
    const [ingestion, news, images, jobs, lastNews, recentNews] = await Promise.all([
      prisma.ingestionRun.findMany({ where: { startedAt: { gte: since }, status: "ERROR" }, orderBy: { startedAt: "desc" }, take: 50 }),
      prisma.newsRun.findMany({ where: { startedAt: { gte: since }, status: "ERROR" }, orderBy: { startedAt: "desc" }, take: 20 }),
      prisma.episodeImageRun.findMany({ where: { startedAt: { gte: since }, status: "ERROR" }, orderBy: { startedAt: "desc" }, take: 20 }),
      prisma.adminJob.findMany({ where: { createdAt: { gte: since }, state: "FAILED" }, orderBy: { seq: "desc" }, take: 20 }),
      prisma.newsRun.findFirst({ where: { status: { not: "RUNNING" } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
      prisma.newsRun.count({ where: { startedAt: { gte: recent }, adminName: null } }),
    ]);

    const drafts: SystemAlertDraft[] = [];
    for (const [source, rows] of groupBy(ingestion, (r) => r.source)) {
      const label = WATCHED_SERVICES.find((s) => s.source === source)?.label ?? source;
      drafts.push(...failedRunAlerts(`run-${source}`, label, "/admin/jobs", rows));
    }
    drafts.push(...failedRunAlerts("news", "Busca de notícias", "/admin/scrapers", news));
    drafts.push(...failedRunAlerts("episode-images", "Busca de imagens dos episódios", "/admin/scrapers", images));
    for (const job of jobs) {
      drafts.push({ key: `job:${job.seq}`, source: "job", title: `Job #${job.seq} (${job.kind}) falhou`, message: job.error ? job.error.slice(0, 300) : null, href: `/admin/jobs/${job.seq}` });
    }

    for (const service of WATCHED_SERVICES) {
      const [last, recentCount] = await Promise.all([
        prisma.ingestionRun.findFirst({ where: { source: service.source }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
        prisma.ingestionRun.count({ where: { source: service.source, startedAt: { gte: recent } } }),
      ]);
      const stale = staleServiceAlert(service, last?.startedAt ?? null, recentCount > 0, now);
      if (stale) drafts.push(stale);
    }
    // A busca diária de notícias: só conta se ela já rodou sozinha (sem admin) nesta semana.
    const newsStale = staleServiceAlert({ source: "news", label: "Busca diária de notícias", staleAfterMs: NEWS_STALE_MS }, lastNews?.startedAt ?? null, recentNews > 0, now);
    if (newsStale) drafts.push({ ...newsStale, href: "/admin/scrapers" });

    if (drafts.length > 0) await prisma.systemAlert.createMany({ data: drafts, skipDuplicates: true });
    await prisma.systemAlert.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - KEEP_MS) } } });
  } catch (error) {
    console.error("[systemAlerts] falhou ao varrer:", error);
  }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) out.set(key(row), [...(out.get(key(row)) ?? []), row]);
  return out;
}

export type SystemAlertItem = { id: string; source: string; title: string; message: string | null; href: string | null; createdAt: string; readAt: string | null };

/** Os avisos do sistema para um admin (os mais recentes primeiro), com "lido" do ponto de vista dele. */
export async function systemAlertsFor(userId: string): Promise<SystemAlertItem[]> {
  const rows = await prisma.systemAlert.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    title: r.title,
    message: r.message,
    href: r.href,
    createdAt: r.createdAt.toISOString(),
    // Sem a hora exata da leitura: basta saber se já leu.
    readAt: r.readBy.includes(userId) ? r.createdAt.toISOString() : null,
  }));
}

/** Marca avisos como lidos para um admin (todos, sem `ids`). */
export async function markSystemAlertsRead(userId: string, ids?: string[]): Promise<number> {
  const rows = await prisma.systemAlert.findMany({ where: { ...(ids ? { id: { in: ids } } : {}), NOT: { readBy: { has: userId } } }, select: { id: true } });
  if (rows.length === 0) return 0;
  await prisma.systemAlert.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { readBy: { push: userId } } });
  return rows.length;
}
