import type { AiringScheduleEntry } from "@prisma/client";

export type CalendarItem = {
  key: string;
  anilistId: number;
  animeId: string | null;
  episode: number;
  airingAt: string;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  genres: string[];
  inMyList: boolean;
};

export function calendarItemFromCache(
  entry: AiringScheduleEntry,
  myAnimeByAnilistId: Map<number, string>
): CalendarItem {
  return {
    key: `${entry.anilistId}-${entry.episode}`,
    anilistId: entry.anilistId,
    animeId: myAnimeByAnilistId.get(entry.anilistId) ?? null,
    episode: entry.episode,
    airingAt: entry.airingAt.toISOString(),
    titleRomaji: entry.titleRomaji,
    titleEnglish: entry.titleEnglish,
    titleNative: entry.titleNative,
    coverImage: entry.coverImage,
    genres: entry.genres ? entry.genres.split(",").filter(Boolean) : [],
    inMyList: myAnimeByAnilistId.has(entry.anilistId),
  };
}
