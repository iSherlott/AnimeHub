import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { commitImport } from "@/lib/adminImport/pipeline";

/** Confirmar importação: só com zero pendências (registros e conflitos). Autorização explícita, nunca por clique no scrim. */
export async function POST(_request: Request, { params }: { params: Promise<{ seq: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const seq = Number((await params).seq);
  if (!Number.isInteger(seq) || seq < 1) return NextResponse.json({ error: "Job inválido." }, { status: 400 });

  const result = await commitImport(seq, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, summary: result.summary });
}
