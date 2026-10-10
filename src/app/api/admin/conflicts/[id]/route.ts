import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { resolveConflict, type ConflictResolution } from "@/lib/adminImport/pipeline";

/**
 * Resolve um conflito de horário: "A" mantém a fonte atual, "B" adota a
 * importada e "MANUAL" define um valor com motivo. B/MANUAL criam um override
 * auditável — o valor original nunca é apagado.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  let body: { resolution?: unknown; value?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason : undefined;
  let input: ConflictResolution;
  if (body.resolution === "A") input = { resolution: "A" };
  else if (body.resolution === "B") input = { resolution: "B", reason };
  else if (body.resolution === "MANUAL") {
    const value = typeof body.value === "string" ? new Date(body.value) : new Date(NaN);
    input = { resolution: "MANUAL", value, reason: reason ?? "" };
  } else return NextResponse.json({ error: "Resolução inválida." }, { status: 400 });

  const result = await resolveConflict((await params).id, input, { id: user.id, name: user.displayName });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
