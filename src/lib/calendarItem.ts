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
  /** Só preenchido quando `inMyList` — não existe fonte pra isso vindo do
   * cache de calendário (AiringScheduleEntry), só da própria linha de
   * Anime do usuário. */
  titlePortuguese: string | null;
  coverImage: string | null;
  genres: string[];
  inMyList: boolean;
  /** Sinopse — como titlePortuguese, só disponível pra quem já tem o
   * anime na lista (AiringScheduleEntry não guarda descrição nenhuma;
   * ver decisão no lote 2 do Epic 27). */
  description: string | null;
  descriptionPortuguese: string | null;
  isFavorite: boolean;
};

export type OwnedAnimeCalendarInfo = {
  id: string;
  titlePortuguese: string | null;
  description: string | null;
  descriptionPortuguese: string | null;
  isFavorite: boolean;
};

export function calendarItemFromCache(
  entry: AiringScheduleEntry,
  myAnimeByAnilistId: Map<number, OwnedAnimeCalendarInfo>
): CalendarItem {
  const owned = myAnimeByAnilistId.get(entry.anilistId) ?? null;
  return {
    key: `${entry.anilistId}-${entry.episode}`,
    anilistId: entry.anilistId,
    animeId: owned?.id ?? null,
    episode: entry.episode,
    airingAt: entry.airingAt.toISOString(),
    titleRomaji: entry.titleRomaji,
    titleEnglish: entry.titleEnglish,
    titleNative: entry.titleNative,
    titlePortuguese: owned?.titlePortuguese ?? null,
    coverImage: entry.coverImage,
    genres: entry.genres ? entry.genres.split(",").filter(Boolean) : [],
    inMyList: owned !== null,
    description: owned?.description ?? null,
    descriptionPortuguese: owned?.descriptionPortuguese ?? null,
    isFavorite: owned?.isFavorite ?? false,
  };
}
