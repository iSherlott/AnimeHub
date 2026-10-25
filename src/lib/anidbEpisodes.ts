import type { CatalogEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAnidbAnimeById, isAnidbConfigured, type AnidbAnime } from "@/lib/anidb";
import { upsertSourceEpisodes, type SourceEpisode } from "@/lib/globalEpisodes";
import { markCancelled, startExclusiveJob } from "@/lib/jobLock";

/**
 * Episódios das obras sem AniList ID (obras só do AniDB). A AniList não tem essas obras, então o episódio vem do AniDB:
 * número, títulos e o dia (sem horário — vira "só o dia", nunca um horário inventado). A identidade do episódio é
 * (obra do catálogo, número). Especiais do AniDB (S1, C2, T1…) não entram na sequência regular.
 *
 * O AniDB limita as consultas (uma a cada 2 s, e bane quem abusa): o lote espera `ANIDB_REQUEST_GAP_MS` (padrão 4 s)
 * entre obras, consulta cada obra no máximo uma vez a cada 30 dias (`AnidbEpisodeCheck`), para no primeiro sinal de
 * bloqueio e é retomável e cancelável (job exclusivo ANIDB_EPISODES).
 */
export const RECHECK_AFTER_MS = 30 * 86_400_000;
const GAP_MS = () => Math.max(0, Number(process.env.ANIDB_REQUEST_GAP_MS ?? 4000));
export const ANIDB_BATCH_MAX = 300;

export class AnidbBannedError extends Error {}

/** Episódios regulares do AniDB no formato das fontes (só números puros; especiais ficam de fora). */
export function regularEpisodes(anime: Pick<AnidbAnime, "episodes">): SourceEpisode[] {
  return anime.episodes
    .filter((ep) => /^\d+$/.test(ep.number.trim()))
    .map((ep) => ({
      number: Number(ep.number.trim()),
      titleRomaji: ep.titles.find((t) => t.language === "x-jat")?.title ?? null,
      titleEnglish: ep.titles.find((t) => t.language === "en")?.title ?? null,
      titleJapanese: ep.titles.find((t) => t.language === "ja")?.title ?? null,
      airDate: ep.airDate ? new Date(`${ep.airDate}T00:00:00Z`) : null,
    }));
}

/** Busca e grava os episódios de uma obra no AniDB. Devolve quantos episódios foram gravados ou completados. */
export async function fetchAnidbEpisodes(entry: Pick<CatalogEntry, "id" | "anidbId" | "anilistId" | "titleRomaji" | "titleEnglish" | "titleNative">, mode: "fill" | "refresh" = "fill"): Promise<{ found: number; written: number }> {
  if (entry.anidbId === null) throw new Error("A obra não tem AniDB ID.");
  if (!isAnidbConfigured()) throw new Error("AniDB não configurada (ANIDB_CLIENT_NAME e ANIDB_CLIENT_VERSION).");
  try {
    const anime = await getAnidbAnimeById(entry.anidbId);
    const episodes = regularEpisodes(anime);
    const written = await upsertSourceEpisodes(entry.anilistId, { titleRomaji: entry.titleRomaji, titleEnglish: entry.titleEnglish, titleNative: entry.titleNative, catalogEntryId: entry.id }, episodes, "anidb", mode);
    await prisma.anidbEpisodeCheck.upsert({ where: { catalogEntryId: entry.id }, create: { catalogEntryId: entry.id, anidbId: entry.anidbId, found: episodes.length }, update: { anidbId: entry.anidbId, found: episodes.length, error: null, checkedAt: new Date() } });
    return { found: episodes.length, written };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.anidbEpisodeCheck
      .upsert({ where: { catalogEntryId: entry.id }, create: { catalogEntryId: entry.id, anidbId: entry.anidbId, error: message.slice(0, 300) }, update: { error: message.slice(0, 300), checkedAt: new Date() } })
      .catch(() => undefined);
    // "Banned" / limite estourado: o lote inteiro para (insistir só piora o bloqueio).
    if (/banned|555|flood|too many/i.test(message)) throw new AnidbBannedError(message);
    throw error;
  }
}

/** Obras só do AniDB na plataforma que ainda não foram consultadas (ou faz mais de 30 dias, ou deram erro). */
export async function pendingAnidbWorks(limit: number, now: Date = new Date()) {
  const checked = await prisma.anidbEpisodeCheck.findMany({ where: { error: null, checkedAt: { gt: new Date(now.getTime() - RECHECK_AFTER_MS) } }, select: { catalogEntryId: true } });
  return prisma.catalogEntry.findMany({
    where: { onPlatform: true, anilistId: null, anidbId: { not: null }, id: { notIn: checked.map((c) => c.catalogEntryId) } },
    orderBy: [{ seasonYear: "desc" }, { id: "asc" }],
    take: limit,
    select: { id: true, anidbId: true, anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true },
  });
}

export type AnidbEpisodesProgress = { total: number; done: number; withEpisodes: number; episodes: number; failed: number; banned: boolean; cancelled?: boolean; currentTitle: string | null; updatedAt: string };

export async function anidbEpisodesStatus() {
  const [works, checked, withEpisodes, failed, job] = await Promise.all([
    prisma.catalogEntry.count({ where: { onPlatform: true, anilistId: null, anidbId: { not: null } } }),
    prisma.anidbEpisodeCheck.count({ where: { error: null } }),
    prisma.catalogEntry.count({ where: { onPlatform: true, anilistId: null, anidbId: { not: null }, schedule: { some: {} } } }),
    prisma.anidbEpisodeCheck.count({ where: { error: { not: null } } }),
    prisma.adminJob.findFirst({ where: { kind: "ANIDB_EPISODES" }, orderBy: { seq: "desc" } }),
  ]);
  return { configured: isAnidbConfigured(), works, checked, withEpisodes, failed, job: job ? { seq: job.seq, state: job.state, progressNote: job.progressNote, finishedAt: job.finishedAt, error: job.error } : null };
}

/** Inicia o lote (um por vez). Roda em segundo plano; devolve o job ou o que já está rodando. */
export async function startAnidbEpisodesJob(actor: { id: string; name: string }, limit: number): Promise<{ seq: number } | { running: number }> {
  const started = await startExclusiveJob("ANIDB_EPISODES", { source: "AniDB", season: `Episódios das obras só do AniDB (até ${limit})`, stage: "COMMIT", progressNote: "Iniciando…", adminId: actor.id, adminName: actor.name });
  if (!started.ok) return { running: started.running.seq };
  const seq = started.job.seq;
  void runAnidbEpisodesJob(seq, limit).catch(async (error) => {
    await prisma.adminJob.update({ where: { seq }, data: { state: "FAILED", finishedAt: new Date(), progressNote: null, error: (error instanceof Error ? error.message : String(error)).slice(0, 300) } }).catch(() => undefined);
  });
  return { seq };
}

export async function runAnidbEpisodesJob(seq: number, limit: number): Promise<AnidbEpisodesProgress> {
  const works = await pendingAnidbWorks(limit);
  const progress: AnidbEpisodesProgress = { total: works.length, done: 0, withEpisodes: 0, episodes: 0, failed: 0, banned: false, currentTitle: null, updatedAt: new Date().toISOString() };
  let cancelRequested = false;
  const save = async (note: string) => {
    progress.updatedAt = new Date().toISOString();
    const job = await prisma.adminJob.update({ where: { seq }, data: { processed: progress.done, total: progress.total, progressNote: note, resultJson: JSON.stringify(progress), heartbeatAt: new Date() }, select: { cancelRequestedAt: true } }).catch(() => null);
    cancelRequested = Boolean(job?.cancelRequestedAt);
  };
  await save(`Consultando ${works.length} obra(s) no AniDB…`);
  for (const [index, entry] of works.entries()) {
    if (cancelRequested) {
      progress.cancelled = true;
      break;
    }
    if (index > 0 && GAP_MS() > 0) await new Promise((resolve) => setTimeout(resolve, GAP_MS()));
    progress.currentTitle = entry.titleNative ?? entry.titleRomaji;
    try {
      const { found } = await fetchAnidbEpisodes(entry);
      if (found > 0) progress.withEpisodes += 1;
      progress.episodes += found;
    } catch (error) {
      progress.failed += 1;
      await prisma.adminLog.create({ data: { jobSeq: seq, source: "AniDB", level: "WARN", event: "AniDB episodes failed", message: `${entry.titleRomaji} (AniDB ${entry.anidbId}): ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`, context: `catalog:${entry.id}` } }).catch(() => undefined);
      if (error instanceof AnidbBannedError) {
        progress.banned = true;
        progress.done += 1;
        break;
      }
    }
    progress.done += 1;
    await save(`Episódios do AniDB: ${progress.done} de ${progress.total}`);
  }
  progress.currentTitle = null;
  if (progress.cancelled) {
    await markCancelled(seq, `Cancelado a pedido depois de ${progress.done} obra(s); as já consultadas ficam.`);
  } else if (progress.banned) {
    await prisma.adminJob.update({ where: { seq }, data: { state: "FAILED", finishedAt: new Date(), progressNote: null, resultJson: JSON.stringify(progress), error: "O AniDB recusou as consultas (limite ou bloqueio). Espere algumas horas antes de rodar de novo." } });
  } else {
    await prisma.adminJob.update({ where: { seq }, data: { state: "SUCCESS", stage: "NOTIFICATION", finishedAt: new Date(), progressNote: null, processed: progress.done, resultJson: JSON.stringify(progress) } });
  }
  await prisma.adminLog.create({ data: { jobSeq: seq, source: "AniDB", event: "AniDB episodes", message: `${progress.done} obra(s) consultada(s): ${progress.withEpisodes} com episódios (${progress.episodes} no total), ${progress.failed} falha(s).`, context: "Episódios das obras só do AniDB" } }).catch(() => undefined);
  return progress;
}
