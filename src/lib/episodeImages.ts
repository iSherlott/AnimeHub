import { prisma } from "@/lib/prisma";
import { getKitsuEpisodeThumbnail, getKitsuIdByAnilistId } from "@/lib/kitsu";
import { startOfDayInZone, DEFAULT_TIME_ZONE } from "@/lib/timeZone";

/**
 * Imagens dos episódios para o calendário (Kitsu → `EpisodeImage`).
 *
 * Roda todo dia às 00:00 (America/Sao_Paulo) no serviço `cache-updater` e pode
 * ser forçado em Admin → Scrapers. Usa só a API pública da Kitsu (mapeamento
 * oficial AniList → Kitsu); nada é coletado de sites de terceiros (D-30).
 */
export const RUN_LOCK_MS = 30 * 60 * 1000;
export const TIME_BUDGET_MS = 20 * 60 * 1000;
export const MAX_ANIMES = 300;
export const WINDOW_PAST_DAYS = 3;
export const WINDOW_FUTURE_DAYS = 14;
const MAPPING_RECHECK_MS = 14 * 24 * 3600 * 1000;
const REQUEST_GAP_MS = 250;
export const SCHEDULE_TIME_ZONE = DEFAULT_TIME_ZONE;

export type Target = { anilistId: number; episodes: number[] };

/** Episódios da janela que ainda não têm imagem, agrupados por anime (ordem estável). */
export function planTargets(entries: Array<{ anilistId: number; episode: number }>, have: Set<string>): Target[] {
  const byAnime = new Map<number, Set<number>>();
  for (const e of entries) {
    if (have.has(`${e.anilistId}-${e.episode}`)) continue;
    if (!byAnime.has(e.anilistId)) byAnime.set(e.anilistId, new Set());
    byAnime.get(e.anilistId)!.add(e.episode);
  }
  return Array.from(byAnime.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([anilistId, eps]) => ({ anilistId, episodes: Array.from(eps).sort((x, y) => x - y) }));
}

/** A execução diária está "devida" se ainda não houve nenhuma agendada desde a última 00:00 local (também recupera um dia perdido). */
export function isScheduledRunDue(now: Date, lastScheduledStart: Date | null, timeZone: string = SCHEDULE_TIME_ZONE): boolean {
  const midnight = startOfDayInZone(now, timeZone);
  return lastScheduledStart === null || lastScheduledStart.getTime() < midnight.getTime();
}

export type SyncDeps = {
  getKitsuId: (anilistId: number) => Promise<number | null>;
  getThumbnail: (kitsuId: number, episode: number) => Promise<string | null>;
  sleep: (ms: number) => Promise<void>;
};

const defaultDeps: SyncDeps = {
  getKitsuId: getKitsuIdByAnilistId,
  getThumbnail: getKitsuEpisodeThumbnail,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type SyncOutcome =
  | { status: "busy" }
  | { status: "done"; runId: string; result: "OK" | "PARTIAL" | "ERROR"; animes: number; found: number; failed: number };

/** Há uma execução em andamento (não travada há mais de 30 min)? */
export async function isRunning(now: Date = new Date()): Promise<boolean> {
  const running = await prisma.episodeImageRun.findFirst({ where: { status: "RUNNING", startedAt: { gt: new Date(now.getTime() - RUN_LOCK_MS) } } });
  return running !== null;
}

export async function runEpisodeImageSync(options: { trigger: "schedule" | "manual"; adminName?: string | null; now?: Date; deps?: SyncDeps }): Promise<SyncOutcome> {
  const now = options.now ?? new Date();
  const deps = options.deps ?? defaultDeps;
  if (await isRunning(now)) return { status: "busy" };
  // Execução anterior que nunca terminou (processo reiniciado): libera o lock.
  await prisma.episodeImageRun.updateMany({
    where: { status: "RUNNING" },
    data: { status: "ERROR", finishedAt: now, message: "Interrompida antes de terminar (serviço reiniciado)." },
  });

  const run = await prisma.episodeImageRun.create({ data: { status: "RUNNING", trigger: options.trigger, adminName: options.adminName ?? null, startedAt: now } });
  const started = Date.now();
  let animes = 0;
  let found = 0;
  let failed = 0;
  let note = "";

  try {
    const entries = await prisma.airingScheduleEntry.findMany({
      where: { airingAt: { gte: new Date(now.getTime() - WINDOW_PAST_DAYS * 86400_000), lte: new Date(now.getTime() + WINDOW_FUTURE_DAYS * 86400_000) } },
      select: { anilistId: true, episode: true },
    });
    const ids = Array.from(new Set(entries.map((e) => e.anilistId)));
    const existing = ids.length ? await prisma.episodeImage.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true, episode: true } }) : [];
    const targets = planTargets(entries, new Set(existing.map((e) => `${e.anilistId}-${e.episode}`))).slice(0, MAX_ANIMES);

    const targetIds = targets.map((t) => t.anilistId);
    const [sources, catalogHints, animeHints] = await Promise.all([
      prisma.episodeImageSource.findMany({ where: { anilistId: { in: targetIds } } }),
      prisma.catalogEntry.findMany({ where: { anilistId: { in: targetIds }, kitsuId: { not: null } }, select: { anilistId: true, kitsuId: true } }),
      prisma.anime.findMany({ where: { anilistId: { in: targetIds }, kitsuId: { not: null } }, select: { anilistId: true, kitsuId: true }, distinct: ["anilistId"] }),
    ]);
    const sourceById = new Map(sources.map((s) => [s.anilistId, s]));
    const hintById = new Map<number, number>();
    for (const h of [...catalogHints, ...animeHints]) if (h.anilistId !== null && h.kitsuId !== null) hintById.set(h.anilistId, h.kitsuId);

    for (const target of targets) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        note = " Tempo máximo atingido; o restante fica para a próxima execução.";
        break;
      }
      animes += 1;
      let kitsuId: number | null | undefined;
      const cached = sourceById.get(target.anilistId);
      if (cached && (cached.kitsuId !== null || now.getTime() - cached.checkedAt.getTime() < MAPPING_RECHECK_MS)) {
        kitsuId = cached.kitsuId;
      } else if (hintById.has(target.anilistId)) {
        kitsuId = hintById.get(target.anilistId) ?? null;
        await prisma.episodeImageSource.upsert({ where: { anilistId: target.anilistId }, create: { anilistId: target.anilistId, kitsuId }, update: { kitsuId, checkedAt: now } });
      } else {
        try {
          kitsuId = await deps.getKitsuId(target.anilistId);
          await deps.sleep(REQUEST_GAP_MS);
          await prisma.episodeImageSource.upsert({ where: { anilistId: target.anilistId }, create: { anilistId: target.anilistId, kitsuId }, update: { kitsuId, checkedAt: now } });
        } catch (error) {
          console.error(`[episode-images] mapeamento falhou para ${target.anilistId}:`, error);
          failed += 1;
          continue;
        }
      }
      if (kitsuId === null || kitsuId === undefined) continue; // sem mapeamento: usa a capa do anime

      for (const episode of target.episodes) {
        try {
          const thumbnail = await deps.getThumbnail(kitsuId, episode);
          await deps.sleep(REQUEST_GAP_MS);
          if (thumbnail) {
            await prisma.episodeImage.upsert({
              where: { anilistId_episode: { anilistId: target.anilistId, episode } },
              create: { anilistId: target.anilistId, episode, thumbnail },
              update: { thumbnail, fetchedAt: now },
            });
            found += 1;
          }
        } catch (error) {
          console.error(`[episode-images] ${target.anilistId} EP${episode} falhou:`, error);
          failed += 1;
        }
      }
    }

    const result: "OK" | "PARTIAL" | "ERROR" = failed === 0 ? "OK" : found > 0 ? "PARTIAL" : "ERROR";
    const message = `${animes} ${animes === 1 ? "anime" : "animes"} verificados · ${found} ${found === 1 ? "imagem nova" : "imagens novas"} · ${failed} ${failed === 1 ? "falha" : "falhas"}.${note}`;
    await prisma.episodeImageRun.update({ where: { id: run.id }, data: { status: result, finishedAt: new Date(), animes, found, failed, message } });
    await prisma.adminLog
      .create({
        data: {
          source: "Kitsu",
          level: result === "ERROR" ? "ERROR" : result === "PARTIAL" ? "WARN" : "INFO",
          event: "Episode images synced",
          message,
          context: `${options.trigger === "schedule" ? "Agendado 00:00" : "Manual"}${options.adminName ? ` · admin ${options.adminName}` : ""}`,
          adminName: options.adminName ?? null,
        },
      })
      .catch(() => undefined);
    return { status: "done", runId: run.id, result, animes, found, failed };
  } catch (error) {
    console.error("[episode-images] execução falhou:", error);
    await prisma.episodeImageRun.update({ where: { id: run.id }, data: { status: "ERROR", finishedAt: new Date(), animes, found, failed, message: "Falha inesperada; nada foi apagado." } }).catch(() => undefined);
    return { status: "done", runId: run.id, result: "ERROR", animes, found, failed };
  }
}
