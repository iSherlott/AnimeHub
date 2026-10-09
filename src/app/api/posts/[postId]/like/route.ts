import { NextResponse } from "next/server";
import { notifySocial } from "@/lib/socialNotifications";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { blockedUserIdSet } from "@/lib/blocks";

type Params = { params: Promise<{ postId: string }> };

/**
 * upsert/deleteMany (não create/delete) — idempotente nas duas direções,
 * então curtir/descurtir duas vezes seguidas (ex.: duplo clique otimista)
 * nunca lança erro de constraint única.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { postId } = await params;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { deletedAt: true, userId: true },
  });
  if (!post || post.deletedAt || (await blockedUserIdSet(user.id)).has(post.userId)) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  // Ver src/app/api/anime/[id]/favorite/route.ts — mesma correção pro
  // mesmo anti-padrão (achado real da 10ª rodada de auditoria, Epic 18).
  if (typeof body.liked !== "boolean") {
    return NextResponse.json({ error: "liked deve ser um booleano" }, { status: 400 });
  }
  const liked = body.liked;

  if (liked) {
    await prisma.postLike.upsert({
      where: { postId_userId: { postId, userId: user.id } },
      create: { postId, userId: user.id },
      update: {},
    });
    await notifySocial({ type: "POST_LIKE", recipientId: post.userId, actorId: user.id, postId });
  } else {
    await prisma.postLike.deleteMany({ where: { postId, userId: user.id } });
  }

  const likeCount = await prisma.postLike.count({ where: { postId } });
  return NextResponse.json({ liked, likeCount });
}
