import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { listPending, PendingError, postpone } from "@/lib/pending";

/** "Para assistir": as obras que a própria pessoa adiou, com até onde cada uma já saiu (fato global da obra). */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ pending: await listPending(user.id) });
}

/** Adiar a obra: `{ anilistId }` (D5: sem número de episódio; um `episode` enviado por cliente antigo é ignorado). Só de obra acompanhada. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  let body: { anilistId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const anilistId = Number(body.anilistId);
  if (!Number.isInteger(anilistId) || anilistId <= 0) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
  try {
    const { postponedAt } = await postpone(user.id, anilistId);
    return NextResponse.json({ anilistId, postponed: true, postponedAt }, { status: 201 });
  } catch (error) {
    if (error instanceof PendingError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    throw error;
  }
}
