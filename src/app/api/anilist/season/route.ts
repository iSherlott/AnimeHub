import { NextRequest, NextResponse } from "next/server";
import { currentSeason, getSeasonalAnime } from "@/lib/anilist";
import { cacheAniListMedia, getCachedSeason } from "@/lib/catalogCache";
import {
  discoverItemFromAniList,
  discoverItemFromCatalogEntry,
} from "@/lib/discoverItem";

const OTHER_SOURCES_DISABLED = process.env.DISABLE_OTHER_SOURCES === "true";

export async function GET(request: NextRequest) {
  const seasonParam = request.nextUrl.searchParams.get("season");
  const yearParam = request.nextUrl.searchParams.get("year");

  const fallback = currentSeason();
  const season = (seasonParam as typeof fallback.season) || fallback.season;
  const seasonYear = yearParam ? parseInt(yearParam, 10) : fallback.seasonYear;

  if (OTHER_SOURCES_DISABLED) {
    const cached = await getCachedSeason(season, seasonYear);
    return NextResponse.json({
      season,
      seasonYear,
      results: cached.map(discoverItemFromCatalogEntry),
      cached: true,
      disabled: true,
    });
  }

  try {
    const media = await getSeasonalAnime(season, seasonYear);
    await cacheAniListMedia(media, { rankFromOrder: true });
    return NextResponse.json({
      season,
      seasonYear,
      results: media.map(discoverItemFromAniList),
      cached: false,
    });
  } catch (error) {
    console.error(error);
    const cached = await getCachedSeason(season, seasonYear);
    if (cached.length > 0) {
      return NextResponse.json({
        season,
        seasonYear,
        results: cached.map(discoverItemFromCatalogEntry),
        cached: true,
      });
    }
    return NextResponse.json(
      { error: "Falha ao buscar lançamentos da temporada" },
      { status: 502 }
    );
  }
}
