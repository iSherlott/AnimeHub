import { prisma } from "@/lib/prisma";
import type { AniListAiringEntry } from "@/lib/anilist";
import type { AiringScheduleEntry } from "@prisma/client";

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
    };
    await prisma.airingScheduleEntry.upsert({
      where: { anilistId_episode: { anilistId: entry.anilistId, episode: entry.episode } },
      create: data,
      update: data,
    });
  }
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
