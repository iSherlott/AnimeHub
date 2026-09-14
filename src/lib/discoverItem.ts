import type { CatalogEntry } from "@prisma/client";
import { fuzzyDateToISO, type AniListMedia } from "@/lib/anilist";

export type DiscoverItem = {
  key: string;
  anilistId: number | null;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  genres: string[];
  status: string | null;
  season: string | null;
  startDate: string | null;
  endDate: string | null;
  nextEpisodeNumber: number | null;
  nextEpisodeAt: string | null;
  popularityRank: number | null;
  cached: boolean;
};

export function discoverItemFromAniList(media: AniListMedia): DiscoverItem {
  return {
    key: `anilist-${media.id}`,
    anilistId: media.id,
    titleRomaji: media.title.romaji,
    titleEnglish: media.title.english,
    titleNative: media.title.native,
    coverImage: media.coverImage.extraLarge,
    bannerImage: media.bannerImage,
    description: media.description,
    episodes: media.episodes,
    genres: media.genres,
    status: media.status,
    season: media.season,
    startDate: fuzzyDateToISO(media.startDate),
    endDate: fuzzyDateToISO(media.endDate),
    nextEpisodeNumber: media.nextAiringEpisode?.episode ?? null,
    nextEpisodeAt: media.nextAiringEpisode
      ? new Date(media.nextAiringEpisode.airingAt * 1000).toISOString()
      : null,
    popularityRank: null,
    cached: false,
  };
}

export function discoverItemFromCatalogEntry(
  entry: CatalogEntry
): DiscoverItem {
  return {
    key: entry.anilistId ? `anilist-${entry.anilistId}` : `kitsu-${entry.kitsuId}`,
    anilistId: entry.anilistId,
    titleRomaji: entry.titleRomaji,
    titleEnglish: entry.titleEnglish,
    titleNative: entry.titleNative,
    coverImage: entry.coverImage,
    bannerImage: entry.bannerImage,
    description: entry.description,
    episodes: entry.episodes,
    genres: entry.genres ? entry.genres.split(",").filter(Boolean) : [],
    status: entry.status,
    season: entry.season,
    startDate: entry.startDate ? entry.startDate.toISOString() : null,
    endDate: entry.endDate ? entry.endDate.toISOString() : null,
    nextEpisodeNumber: entry.nextEpisodeNumber,
    nextEpisodeAt: entry.nextEpisodeAt ? entry.nextEpisodeAt.toISOString() : null,
    popularityRank: entry.popularityRank,
    cached: true,
  };
}
