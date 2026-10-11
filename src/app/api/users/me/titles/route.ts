import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { equipTitle, listTitles } from "@/lib/quiz";

/** Minhas conquistas: títulos desbloqueados (persistem mesmo sem acompanhar a obra). */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ titles: await listTitles(user.id) });
}

/** Equipa um título (um por vez) ou remove do perfil com `{ titleId: null }`. Não altera a coleção. */
export async function PATCH(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  let body: { titleId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  if (body.titleId !== null && typeof body.titleId !== "string") return NextResponse.json({ error: "Título inválido" }, { status: 400 });
  const ok = await equipTitle(user.id, body.titleId as string | null);
  if (!ok) return NextResponse.json({ error: "Título não encontrado na sua coleção." }, { status: 404 });
  return NextResponse.json({ titles: await listTitles(user.id) });
}
