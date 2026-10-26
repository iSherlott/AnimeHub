import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { rate, ratingSummary } from "@/lib/profileOrkut";

type Params = { params: Promise<{ id: string }> };

/** Avaliar um amigo: `{ otaku?, gentil?, semSpoiler? }`, de 0 a 3 cada. Devolve a média atualizada. */
export async function PUT(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;
  const result = await rate(user.id, id, await request.json().catch(() => null));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(await ratingSummary(id, user.id));
}
