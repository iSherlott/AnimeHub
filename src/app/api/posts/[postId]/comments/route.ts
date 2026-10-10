import { NextResponse } from "next/server";
import { notifySocial } from "@/lib/socialNotifications";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { isBlank } from "@/lib/text";
import { blockedUserIdSet } from "@/lib/blocks";

type Params = { params: Promise<{ postId: string }> };

const MAX_BODY_LENGTH = 2000;

/**
 * Comentário por post (Epic 24) — diferente de Comment (Epic 15, por
 * anilistId, só pra quem também tem o anime na própria lista): aqui é
 * público, por post específico, sem exigir posse de anime nenhum — o
 * post já apareceu no feed público pra quem está lendo.
 */
async function loadVisiblePost(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true, userId: true },
  });
  if (!post || post.deletedAt) return null;
  return post;
}

export async function GET(_request: Request, { params }: Params) {
  const { postId } = await params;
  const post = await loadVisiblePost(postId);
  if (!post) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }

  const user = await getCurrentUser();
  const blocked = await blockedUserIdSet(user?.id ?? null);
  if (blocked.has(post.userId)) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }
  const comments = await prisma.postComment.findMany({
    where: { postId, deletedAt: null, userId: { notIn: [...blocked] } },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, displayName: true, handle: true } },
      replyToUser: { select: { id: true, displayName: true } },
    },
  });

  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      // Quem recebe a resposta; some se a pessoa foi bloqueada (sem expor nada).
      replyTo: c.replyToUser && !blocked.has(c.replyToUser.id) ? c.replyToUser : null,
      body: c.isSpoiler ? "" : c.body,
      isSpoiler: c.isSpoiler,
      createdAt: c.createdAt.toISOString(),
      author: { id: c.user.id, displayName: c.user.displayName, handle: c.user.handle },
      isMine: c.user.id === user?.id,
    })),
  });
}

export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { postId } = await params;
  const post = await loadVisiblePost(postId);
  if (!post || (await blockedUserIdSet(user.id)).has(post.userId)) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  // isBlank (não só !text) — ver src/lib/text.ts: um comentário só de
  // zero-width space passava por .trim() como "não vazio".
  if (isBlank(text)) {
    return NextResponse.json({ error: "Comentário não pode ser vazio" }, { status: 400 });
  }
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Comentário muito longo (máximo ${MAX_BODY_LENGTH} caracteres)` },
      { status: 400 }
    );
  }

  const isSpoiler = body.isSpoiler === true;

  // Resposta a uma resposta (um nível visual): o alvo precisa existir NESTE
  // post, não estar apagado nem ser de alguém bloqueado; o parentId gravado é
  // sempre a resposta de topo, e replyToUserId guarda a quem se responde.
  let parentId: string | null = null;
  let replyToUserId: string | null = null;
  if (body.parentId !== undefined && body.parentId !== null) {
    if (typeof body.parentId !== "string") {
      return NextResponse.json({ error: "parentId inválido" }, { status: 400 });
    }
    const target = await prisma.postComment.findUnique({
      where: { id: body.parentId },
      select: { id: true, postId: true, parentId: true, userId: true, deletedAt: true },
    });
    if (
      !target ||
      target.postId !== postId ||
      target.deletedAt ||
      (await blockedUserIdSet(user.id)).has(target.userId)
    ) {
      return NextResponse.json({ error: "Comentário respondido não encontrado" }, { status: 404 });
    }
    parentId = target.parentId ?? target.id;
    replyToUserId = target.userId;
  }

  const comment = await prisma.postComment.create({
    data: { postId, userId: user.id, body: text, isSpoiler, parentId, replyToUserId },
    include: {
      user: { select: { id: true, displayName: true, handle: true } },
      replyToUser: { select: { id: true, displayName: true } },
    },
  });

  // Aviso social SEM texto: resposta a um comentário avisa quem foi
  // respondido; um comentário novo avisa quem escreveu a publicação.
  await notifySocial(
    replyToUserId
      ? { type: "COMMENT_REPLY", recipientId: replyToUserId, actorId: user.id, postId, commentId: comment.id }
      : { type: "POST_REPLY", recipientId: post.userId, actorId: user.id, postId, commentId: comment.id }
  );

  return NextResponse.json(
    {
      comment: {
        id: comment.id,
        parentId: comment.parentId,
        replyTo: comment.replyToUser,
        body: comment.isSpoiler ? "" : comment.body,
        isSpoiler: comment.isSpoiler,
        createdAt: comment.createdAt.toISOString(),
        author: { id: comment.user.id, displayName: comment.user.displayName, handle: comment.user.handle },
        isMine: true,
      },
    },
    { status: 201 }
  );
}
