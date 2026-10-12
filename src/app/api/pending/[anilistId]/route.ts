import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { resolvePending } from "@/lib/pending";

/** "Já assisti" / retomar: remove a pendência da obra. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ anilistId: string }> }) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const raw = (await params).anilistId;
  if (!/^\d{1,9}$/.test(raw)) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
  await resolvePending(user.id, Number(raw));
  return NextResponse.json({ ok: true });
}
