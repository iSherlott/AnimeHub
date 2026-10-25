import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { reapplyImport } from "@/lib/adminImport/pipeline";

/** Reaplicar um lote concluído: completa o que ficou pela metade e leva ao catálogo o que o parser passou a ler (idempotente). */
export async function POST(_request: Request, { params }: { params: Promise<{ seq: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const seq = Number((await params).seq);
  if (!Number.isInteger(seq) || seq < 1) return NextResponse.json({ error: "Job inválido." }, { status: 400 });

  const result = await reapplyImport(seq, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, summary: result.summary });
}
