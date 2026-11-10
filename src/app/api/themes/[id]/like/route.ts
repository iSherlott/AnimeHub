import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { toggleThemeLike } from "@/lib/animeThemes";

type Params = { params: Promise<{ id: string }> };

/** `{ liked }`: curte ou descurte uma abertura/encerramento (soma no ranking da temporada). */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { liked?: unknown } | null;
  const result = await toggleThemeLike(id, user.id, body?.liked !== false);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ likes: result.likes });
}
