import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { removeOverride } from "@/lib/adminImport/pipeline";

/** Remove um override: o horário efetivo volta ao valor original da fonte (registrado nos logs). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const result = await removeOverride((await params).id, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
