import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { listPending, PendingError, postpone } from "@/lib/pending";

/** "Para assistir": as pendências da própria pessoa (episódios adiados), com até onde a obra já saiu. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ pending: await listPending(user.id) });
}

/** Adiar o episódio do dia: `{ anilistId, episode }`. Só de obra acompanhada; guarda o episódio mais antigo sem ver. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  let body: { anilistId?: unknown; episode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const anilistId = Number(body.anilistId);
  const episode = Number(body.episode);
  if (!Number.isInteger(anilistId) || anilistId <= 0) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
  try {
    const fromEpisode = await postpone(user.id, anilistId, episode);
    return NextResponse.json({ anilistId, fromEpisode }, { status: 201 });
  } catch (error) {
    if (error instanceof PendingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "NOT_FOLLOWING" ? 403 : 400 });
    throw error;
  }
}
