import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { moderateTopic } from "@/lib/community";

type Params = { params: Promise<{ topicId: string }> };
const ACTIONS = ["pin", "unpin", "lock", "unlock"] as const;

/** Fixar/desafixar e trancar/destrancar o tópico (moderação): `{ action }`. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireStaff("moderation");
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = ACTIONS.find((a) => a === body?.action);
  if (!action) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const result = await moderateTopic((await params).topicId, action);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
