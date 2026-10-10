import { NextRequest, NextResponse } from "next/server";
import { getReadings, readableTexts } from "@/lib/titleReadings";
import { clientIp, rateLimitedResponse } from "@/lib/rateLimit";

/**
 * Kana e furigana de títulos japoneses (preferência "Japonês: kanji + kana"/
 * "kanji + furigana"). Pública — só devolve a leitura do texto enviado —, com
 * limite por IP e tamanho máximo por pedido.
 */
export async function POST(request: NextRequest) {
  const limited = rateLimitedResponse(`readings:${clientIp(request)}`, 120, 60_000);
  if (limited) return limited;

  let body: { texts?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const readings = await getReadings(readableTexts(body.texts));
  return NextResponse.json({ readings });
}
