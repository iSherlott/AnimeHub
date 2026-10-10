import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { retryImport } from "@/lib/adminImport/pipeline";

/** Nova tentativa de um job com falha: gera OUTRO job com o mesmo HTML e preserva a auditoria. */
export async function POST(_request: Request, { params }: { params: Promise<{ seq: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const seq = Number((await params).seq);
  if (!Number.isInteger(seq) || seq < 1) return NextResponse.json({ error: "Job inválido." }, { status: 400 });

  const result = await retryImport(seq, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error, seq: result.seq }, { status: 422 });
  return NextResponse.json({ seq: result.seq }, { status: 201 });
}
