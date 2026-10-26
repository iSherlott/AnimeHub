import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { deleteReply, editReply } from "@/lib/community";

type Params = { params: Promise<{ replyId: string }> };

/** Editar a resposta (só quem escreveu): `{ body, isSpoiler? }`. */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await editReply((await params).replyId, user.id, await request.json().catch(() => null));
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });
}

/** Apagar a resposta: quem escreveu ou a equipe de moderação. */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await deleteReply((await params).replyId, { id: user.id, canModerate: can(user.role, "moderation") });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
