import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { toDtoPage, POST_ROW_INCLUDE } from "@/lib/postFeedDto";

type Params = { params: Promise<{ postId: string }> };

/**
 * Uma publicação para a página dedicada de discussão (Figma `13:42257`).
 * Leitura pública; apagada, inexistente ou de alguém bloqueado respondem
 * igual (404), sem revelar o motivo.
 */
export async function GET(_request: Request, { params }: Params) {
  const { postId } = await params;
  const row = await prisma.post.findUnique({ where: { id: postId }, include: POST_ROW_INCLUDE });
  if (!row || row.deletedAt || row.repostOfId) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }
  const viewer = await getCurrentUser();
  const [dto] = await toDtoPage([row], viewer?.id ?? null);
  if (!dto) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }
  return NextResponse.json({ post: dto });
}

/** Autor apaga o próprio post — a qualquer momento, denunciado ou não. */
export async function DELETE(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { postId } = await params;
  const existing = await prisma.post.findUnique({
    where: { id: postId },
    select: { userId: true, deletedAt: true },
  });
  if (!existing || existing.userId !== user.id || existing.deletedAt) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }

  await prisma.post.update({
    where: { id: postId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
