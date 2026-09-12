import { NextRequest, NextResponse } from "next/server";
import { searchAnime } from "@/lib/anilist";
import { cacheAniListMedia, searchCachedCatalog } from "@/lib/catalogCache";
import {
  discoverItemFromAniList,
  discoverItemFromCatalogEntry,
} from "@/lib/discoverItem";

const OTHER_SOURCES_DISABLED = process.env.DISABLE_OTHER_SOURCES === "true";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  if (OTHER_SOURCES_DISABLED) {
    const cached = await searchCachedCatalog(q.trim());
    return NextResponse.json({
      results: cached.map(discoverItemFromCatalogEntry),
      cached: true,
      disabled: true,
    });
  }

  try {
    const media = await searchAnime(q.trim());
    await cacheAniListMedia(media);
    return NextResponse.json({
      results: media.map(discoverItemFromAniList),
      cached: false,
    });
  } catch (error) {
    console.error(error);
    const cached = await searchCachedCatalog(q.trim());
    if (cached.length > 0) {
      return NextResponse.json({
        results: cached.map(discoverItemFromCatalogEntry),
        cached: true,
      });
    }
    return NextResponse.json(
      { error: "Falha ao buscar na AniList" },
      { status: 502 }
    );
  }
}
