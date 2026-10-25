import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { resolveRecord, type RecordAction } from "@/lib/adminImport/pipeline";

/** Decisão sobre um registro da prévia: confirmar, ignorar, marcar como novo ou trocar o candidato. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;

  let body: { action?: unknown; reason?: unknown; productionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  let input: RecordAction;
  if (body.action === "confirm") input = { action: "confirm" };
  else if (body.action === "new") input = { action: "new" };
  else if (body.action === "ignore") input = { action: "ignore", reason: typeof body.reason === "string" ? body.reason : undefined };
  else if (body.action === "candidate" && typeof body.productionId === "string") input = { action: "candidate", productionId: body.productionId };
  else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });

  const result = await resolveRecord((await params).id, input, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
