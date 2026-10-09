import { prisma } from "@/lib/prisma";
import type { AniListAiringEntry } from "@/lib/anilist";
import type { AiringScheduleEntry } from "@prisma/client";
import { findStaleEntryIds } from "@/lib/airingRefresh";
import { isReschedule, recordRescheduleAlerts } from "@/lib/rescheduleAlerts";

export async function cacheAiringSchedule(entries: AniListAiringEntry[]): Promise<void> {
  for (const entry of entries) {
    const data = {
      anilistId: entry.anilistId,
      episode: entry.episode,
      airingAt: new Date(entry.airingAt * 1000),
      titleRomaji: entry.title.romaji,
      titleEnglish: entry.title.english,
      titleNative: entry.title.native,
      coverImage: entry.coverImage,
      bannerImage: entry.bannerImage,
      genres: entry.genres.join(","),
      description: entry.description,
    };
    // Reagendamento de episódio acompanhado vira alerta "Data alterada"
    // (com o horário anterior) para quem segue a obra.
    const before = await prisma.airingScheduleEntry.findUnique({
      where: { anilistId_episode: { anilistId: entry.anilistId, episode: entry.episode } },
      select: { airingAt: true },
    });
    if (before && isReschedule(before.airingAt, data.airingAt)) {
      await recordRescheduleAlerts(entry.anilistId, entry.episode, before.airingAt, data.airingAt);
    }
    await prisma.airingScheduleEntry.upsert({
      where: { anilistId_episode: { anilistId: entry.anilistId, episode: entry.episode } },
      create: data,
      // fetchedAt só tinha default no create; sem isto nunca indicava frescor.
      update: { ...data, fetchedAt: new Date() },
    });
  }
}

/**
 * Remove do cache os episódios FUTUROS da janela que a AniList deixou de
 * listar. Passado nunca é apagado (histórico). Chamar só após ler a janela
 * completa. Devolve quantas linhas saíram.
 */
export async function pruneMissingFutureEntries(
  fetched: AniListAiringEntry[],
  windowFrom: Date,
  windowTo: Date,
  now: Date = new Date()
): Promise<number> {
  const from = windowFrom > now ? windowFrom : now;
  const existing = await prisma.airingScheduleEntry.findMany({
    where: { airingAt: { gte: from, lt: windowTo } },
    select: { id: true, anilistId: true, episode: true },
  });
  const staleIds = findStaleEntryIds(existing, fetched);
  if (staleIds.length === 0) return 0;
  const result = await prisma.airingScheduleEntry.deleteMany({ where: { id: { in: staleIds } } });
  return result.count;
}

export async function getCachedAiringSchedule(
  from: Date,
  to: Date
): Promise<AiringScheduleEntry[]> {
  return prisma.airingScheduleEntry.findMany({
    where: { airingAt: { gte: from, lte: to } },
    orderBy: { airingAt: "asc" },
  });
}
