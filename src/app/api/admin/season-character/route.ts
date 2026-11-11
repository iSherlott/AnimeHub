import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { parseSeasonInput } from "@/lib/tierList";
import { publishSeasonCharacter } from "@/lib/seasonCharacters";

/** Personagem da temporada (12/11/2026): POST `{ season, seasonYear }` publica o mais favoritado no Feed (NewsHub). */
export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { season?: unknown; seasonYear?: unknown } | null;
  const season = parseSeasonInput(body?.season, body?.seasonYear);
  if (!season) return NextResponse.json({ error: "Temporada inválida." }, { status: 400 });
  const result = await publishSeasonCharacter(season);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ postId: result.postId, characterId: result.characterId }, { status: 201 });
}
