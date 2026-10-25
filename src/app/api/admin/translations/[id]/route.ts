import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { approveTranslation, editTranslation, rejectTranslation, retranslate } from "@/lib/translations";

export const dynamic = "force-dynamic";

/**
 * Decisão sobre a sinopse em português de uma obra: `{ action: "approve" }` · `{ action: "reject", reason? }` ·
 * `{ action: "edit", text }` · `{ action: "retranslate" }`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const id = (await params).id;
  const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown; text?: unknown } | null;
  const actor = { id: user.id, name: user.displayName };
  let result;
  if (body?.action === "approve") result = await approveTranslation(id, actor);
  else if (body?.action === "reject") result = await rejectTranslation(id, typeof body.reason === "string" ? body.reason.slice(0, 500) : null, actor);
  else if (body?.action === "edit" && typeof body.text === "string") result = await editTranslation(id, body.text, actor);
  else if (body?.action === "retranslate") result = await retranslate(id);
  else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
