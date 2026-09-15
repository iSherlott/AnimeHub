import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { isBlank } from "@/lib/text";

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
    select: { id: true, deletedAt: true },
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
  const comments = await prisma.postComment.findMany({
    where: { postId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, displayName: true } } },
  });

  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: { id: c.user.id, displayName: c.user.displayName },
      isMine: c.user.id === user?.id,
    })),
  });
}

export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { postId } = await params;
  const post = await loadVisiblePost(postId);
  if (!post) {
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

  const comment = await prisma.postComment.create({
    data: { postId, userId: user.id, body: text },
    include: { user: { select: { id: true, displayName: true } } },
  });

  return NextResponse.json(
    {
      comment: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author: { id: comment.user.id, displayName: comment.user.displayName },
        isMine: true,
      },
    },
    { status: 201 }
  );
}
