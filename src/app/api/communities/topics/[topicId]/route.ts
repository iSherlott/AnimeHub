import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { deleteTopic, editTopic } from "@/lib/community";

type Params = { params: Promise<{ topicId: string }> };

/** Editar o tópico (só quem criou): `{ title?, body?, isSpoiler?, catalogEntryId? }`. */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await editTopic((await params).topicId, user.id, await request.json().catch(() => null));
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });
}

/** Apagar o tópico: quem criou ou a equipe de moderação (fica guardado, some da comunidade). */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await deleteTopic((await params).topicId, { id: user.id, canModerate: can(user.role, "moderation") });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
