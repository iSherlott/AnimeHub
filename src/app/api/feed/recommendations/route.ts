import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getAggregatedRecommendations } from "@/lib/animeRecommendations";

const LIMIT = 4;

/**
 * "Animes recomendados" da lateral do Feed (Epic 26) — autenticada, já
 * que a agregação é por usuário (Anime.recommendationsJson por animes
 * da PRÓPRIA lista). Ver src/lib/animeRecommendations.ts.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const animes = await getAggregatedRecommendations(user.id, LIMIT);
  return NextResponse.json({ animes });
}
