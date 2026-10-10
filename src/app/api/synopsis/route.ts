import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { getSynopsis, isTranslationTarget } from "@/lib/synopsis";

/**
 * Sinopse traduzida (pt/ja) de uma obra da AniList. Pública — o texto vem do
 * nosso catálogo, nunca do cliente —, com limite por IP.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimitedResponse(`synopsis:${clientIp(request)}`, 90, 60_000);
  if (limited) return limited;

  const anilistId = Number(request.nextUrl.searchParams.get("anilistId"));
  const lang = request.nextUrl.searchParams.get("lang");
  if (!Number.isInteger(anilistId) || anilistId <= 0 || !isTranslationTarget(lang)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }
  const synopsis = await getSynopsis(anilistId, lang);
  return NextResponse.json({ synopsis });
}
