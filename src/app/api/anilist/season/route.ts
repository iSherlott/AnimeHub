import { NextRequest, NextResponse } from "next/server";
import { getSeasonalCatalog, type Season, type SeasonalResult } from "@/lib/seasonalCatalog";
import { callInternalService } from "@/lib/serviceDelegate";

export async function GET(request: NextRequest) {
  const seasonParam = request.nextUrl.searchParams.get("season") as Season | null;
  const yearParam = request.nextUrl.searchParams.get("year");
  const seasonYear = yearParam ? parseInt(yearParam, 10) : null;

  const delegated = await callInternalService<SeasonalResult>(
    process.env.CACHE_UPDATER_URL,
    "/season",
    { season: seasonParam, seasonYear }
  );
  if (delegated) return NextResponse.json(delegated);

  try {
    const result = await getSeasonalCatalog(seasonParam, seasonYear);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Falha ao buscar lançamentos da temporada" },
      { status: 502 }
    );
  }
}
