import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { vote } from "@/lib/community";

type Params = { params: Promise<{ topicId: string }> };

/** Votar na enquete do tópico: `{ optionId }`. Um voto por pessoa, sem troca; só membros. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { optionId?: unknown } | null;
  const result = await vote((await params).topicId, user.id, body?.optionId);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
