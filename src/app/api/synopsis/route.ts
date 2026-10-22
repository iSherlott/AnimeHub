import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimitedResponse } from "@/lib/rateLimit";
import { getSynopsis, getSynopsisByEntry, isTranslationTarget } from "@/lib/synopsis";

/**
 * Sinopse traduzida (pt/ja) de uma obra, pelo `anilistId` ou, para as obras que só existem no AniDB, pelo `entryId` do
 * catálogo. Pública — o texto vem do nosso catálogo, nunca do cliente —, com limite por IP.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimitedResponse(`synopsis:${clientIp(request)}`, 90, 60_000);
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const lang = params.get("lang");
  if (!isTranslationTarget(lang)) return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });

  const entryId = params.get("entryId");
  if (entryId) {
    if (!/^[a-z0-9]{10,40}$/i.test(entryId)) return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
    return NextResponse.json({ synopsis: await getSynopsisByEntry(entryId, lang) });
  }

  const anilistId = Number(params.get("anilistId"));
  if (!Number.isInteger(anilistId) || anilistId <= 0) return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  return NextResponse.json({ synopsis: await getSynopsis(anilistId, lang) });
}
