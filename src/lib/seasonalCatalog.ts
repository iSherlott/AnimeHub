import { currentSeason, getSeasonalAnime, type AniListMedia } from "@/lib/anilist";
import { cacheAniListMedia, getCachedSeason } from "@/lib/catalogCache";
import { discoverItemFromCatalogEntry } from "@/lib/discoverItem";
import type { DiscoverItem } from "@/lib/discoverItem";
import { hasBlockedGenre } from "@/lib/contentPolicy";

export type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export type SeasonalResult = {
  season: Season;
  seasonYear: number;
  results: DiscoverItem[];
  cached: boolean;
  disabled?: boolean;
};

/**
 * Lançamentos da temporada (Descobrir): SÓ o que a plataforma já tem (catálogo trazido pelo admin). Nada é buscado
 * na AniList ao abrir uma temporada — carga de obras é ação do admin (upload do HTML do AniDB; painel de
 * importação da AniList). `season`/`seasonYear` opcionais — sem eles, usa a temporada atual.
 */
export async function getSeasonalCatalog(
  seasonInput?: Season | null,
  seasonYearInput?: number | null
): Promise<SeasonalResult> {
  const fallback = currentSeason();
  const season = seasonInput || fallback.season;
  const seasonYear = seasonYearInput ?? fallback.seasonYear;
  const cached = await getCachedSeason(season, seasonYear);
  return { season, seasonYear, results: cached.map(discoverItemFromCatalogEntry), cached: true };
}

/**
 * Traz a temporada da AniList para o CACHE (fora da plataforma) e devolve o que é hentai, para a importação
 * reconhecer e descartar esses registros. Usado pela análise do HTML do AniDB, para casar os registros com a AniList.
 */
export async function prefetchSeasonCache(season: Season, seasonYear: number): Promise<{ blocked: AniListMedia[] }> {
  const media = await getSeasonalAnime(season, seasonYear, { includeBlocked: true });
  await cacheAniListMedia(media, { rankFromOrder: false });
  return { blocked: media.filter((m) => hasBlockedGenre(m.genres)) };
}
