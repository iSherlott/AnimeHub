import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { editWork } from "@/lib/catalogEdit";
import { loadWorkDetail } from "@/lib/workDetail";

export const dynamic = "force-dynamic";

/** Detalhe da obra para o admin: obra canônica, cópias, franquia, episódios, pendências e histórico. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const detail = await loadWorkDetail((await params).id);
  if (!detail) return NextResponse.json({ error: "Obra não encontrada." }, { status: 404 });
  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Edita campos canônicos: `{ expectedUpdatedAt, changes: { campo: valor }, reason?, protect? (padrão true), unprotect? }`.
 * 400 com os erros por campo; 409 se a obra mudou depois de aberta (com os valores atuais); o que foi corrigido fica
 * protegido contra a importação; as cópias recebem os campos que copiam.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const result = await editWork((await params).id, body, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error, errors: result.errors, current: result.current }, { status: result.status });
  return NextResponse.json({ entry: result.entry, changed: result.changed, propagated: result.propagated });
}
