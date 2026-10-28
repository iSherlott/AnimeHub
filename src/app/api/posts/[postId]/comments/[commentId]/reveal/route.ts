import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { blockedUserIdSet } from "@/lib/blocks";

type Params = { params: Promise<{ postId: string; commentId: string }> };

/** Revela o texto de UMA resposta marcada como spoiler (não libera as outras). */
export async function GET(_request: Request, { params }: Params) {
  // Sistema fechado: a parte social só abre para quem entrou.
  const { user: member, response: closed } = await requireUser();
  if (!member) return closed;
  const { postId, commentId } = await params;
  const comment = await prisma.postComment.findUnique({
    where: { id: commentId },
    select: { postId: true, userId: true, body: true, deletedAt: true, post: { select: { deletedAt: true } } },
  });
  const viewer = await getCurrentUser();
  if (
    !comment ||
    comment.postId !== postId ||
    comment.deletedAt ||
    comment.post.deletedAt ||
    (await blockedUserIdSet(viewer?.id ?? null)).has(comment.userId)
  ) {
    return NextResponse.json({ error: "Conteúdo indisponível" }, { status: 404 });
  }
  return NextResponse.json({ body: comment.body });
}
