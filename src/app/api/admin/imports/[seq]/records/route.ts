import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { resolveRecordsBulk, type BulkDecision } from "@/lib/adminImport/pipeline";

const MAX_DECISIONS = 500;
const ACTIONS = ["confirm", "new", "ignore"] as const;

/** Decisões de vários registros pendentes de uma vez (a tela de revisão em lote da importação). */
export async function PATCH(request: Request, { params }: { params: Promise<{ seq: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const seq = Number((await params).seq);
  if (!Number.isInteger(seq) || seq < 1) return NextResponse.json({ error: "Importação inválida." }, { status: 400 });

  let body: { decisions?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  if (!Array.isArray(body.decisions) || body.decisions.length === 0 || body.decisions.length > MAX_DECISIONS) {
    return NextResponse.json({ error: `Envie de 1 a ${MAX_DECISIONS} decisões.` }, { status: 400 });
  }
  const decisions: BulkDecision[] = [];
  for (const raw of body.decisions as Array<{ id?: unknown; action?: unknown }>) {
    if (typeof raw?.id !== "string" || !ACTIONS.includes(raw.action as (typeof ACTIONS)[number])) return NextResponse.json({ error: "Decisão inválida." }, { status: 400 });
    decisions.push({ id: raw.id, action: raw.action as BulkDecision["action"] });
  }

  const result = await resolveRecordsBulk(seq, decisions, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, applied: result.applied, skipped: result.skipped });
}
