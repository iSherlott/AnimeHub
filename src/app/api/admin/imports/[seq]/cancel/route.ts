import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { cancelImport } from "@/lib/adminImport/pipeline";

/** Cancela uma importação em revisão — nada foi aplicado ao catálogo. */
export async function POST(_request: Request, { params }: { params: Promise<{ seq: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const seq = Number((await params).seq);
  if (!Number.isInteger(seq) || seq < 1) return NextResponse.json({ error: "Job inválido." }, { status: 400 });

  const result = await cancelImport(seq, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
