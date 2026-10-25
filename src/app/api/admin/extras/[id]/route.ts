import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { editExtra } from "@/lib/extraEdit";

export const dynamic = "force-dynamic";

/**
 * Edita um extra do AniDB (especial, abertura, trailer…): `{ expectedUpdatedAt, changes: { campo: valor }, reason?, protect?
 * (padrão true), unprotect? }`. 400 com erros por campo; 404; 409 se o extra mudou depois de aberto (com os valores atuais).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const result = await editExtra((await params).id, body, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error, errors: result.errors, current: result.current }, { status: result.status });
  return NextResponse.json({ extra: result.extra, changed: result.changed });
}
