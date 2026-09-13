import { currentSeason, getSeasonalAnime } from "@/lib/anilist";
import { cacheAniListMedia, getCachedSeason } from "@/lib/catalogCache";
import { discoverItemFromAniList, discoverItemFromCatalogEntry } from "@/lib/discoverItem";
import type { DiscoverItem } from "@/lib/discoverItem";

const OTHER_SOURCES_DISABLED = process.env.DISABLE_OTHER_SOURCES === "true";

export type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export type SeasonalResult = {
  season: Season;
  seasonYear: number;
  results: DiscoverItem[];
  cached: boolean;
  disabled?: boolean;
};

/**
 * Lançamentos da temporada (Descobrir). Extraído de
 * src/app/api/anilist/season/route.ts pra ser chamado tanto pelo serviço
 * cache-updater (caminho principal) quanto pelo fallback local da rota.
 * `season`/`seasonYear` opcionais — sem eles, usa a temporada atual.
 */
export async function getSeasonalCatalog(
  seasonInput?: Season | null,
  seasonYearInput?: number | null
): Promise<SeasonalResult> {
  const fallback = currentSeason();
  const season = seasonInput || fallback.season;
  const seasonYear = seasonYearInput ?? fallback.seasonYear;

  if (OTHER_SOURCES_DISABLED) {
    const cached = await getCachedSeason(season, seasonYear);
    return {
      season,
      seasonYear,
      results: cached.map(discoverItemFromCatalogEntry),
      cached: true,
      disabled: true,
    };
  }

  try {
    const media = await getSeasonalAnime(season, seasonYear);
    await cacheAniListMedia(media, { rankFromOrder: true });
    return { season, seasonYear, results: media.map(discoverItemFromAniList), cached: false };
  } catch (error) {
    console.error(error);
    const cached = await getCachedSeason(season, seasonYear);
    if (cached.length > 0) {
      return { season, seasonYear, results: cached.map(discoverItemFromCatalogEntry), cached: true };
    }
    throw error;
  }
}
