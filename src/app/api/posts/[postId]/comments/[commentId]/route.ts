import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ postId: string; commentId: string }> };

/** Autor apaga o próprio comentário de post — a qualquer momento. */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { postId, commentId } = await params;
  const existing = await prisma.postComment.findUnique({
    where: { id: commentId },
    select: { postId: true, userId: true, deletedAt: true },
  });
  if (!existing || existing.postId !== postId || existing.userId !== user.id || existing.deletedAt) {
    return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
  }

  await prisma.postComment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
