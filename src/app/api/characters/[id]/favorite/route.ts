import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { toggleFavoriteCharacter } from "@/lib/workCast";

type Params = { params: Promise<{ id: string }> };

/** `{ favorite }`: põe ou tira o personagem dos favoritos do perfil (até 5). */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const characterId = Number((await params).id);
  if (!Number.isInteger(characterId) || characterId <= 0) return NextResponse.json({ error: "Personagem inválido." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { favorite?: unknown } | null;
  const result = await toggleFavoriteCharacter(user.id, characterId, body?.favorite !== false);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ favorites: result.favorites });
}
