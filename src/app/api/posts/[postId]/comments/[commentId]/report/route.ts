import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { isReportReason } from "@/lib/reportReasons";
import { blockedUserIdSet } from "@/lib/blocks";
import { clientIp, hitRateLimit, tooManyRequests } from "@/lib/rateLimit";

type Params = { params: Promise<{ postId: string; commentId: string }> };

/**
 * Denunciar uma RESPOSTA (Figma `13:43571`, fluxo G): o alvo é o comentário,
 * não só o post original. Privada, com motivo fixo, idempotente (denunciar
 * de novo reabre a fila) e sem bloquear o autor automaticamente.
 */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limit = hitRateLimit(`report:${user.id}:${clientIp(request)}`, 30, 10 * 60_000);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSec);

  const { postId, commentId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  if (!body || !isReportReason(body.reason)) {
    return NextResponse.json({ error: "Escolha um motivo para a denúncia" }, { status: 400 });
  }

  const comment = await prisma.postComment.findUnique({
    where: { id: commentId },
    select: { postId: true, userId: true, deletedAt: true, post: { select: { deletedAt: true } } },
  });
  if (
    !comment ||
    comment.postId !== postId ||
    comment.deletedAt ||
    comment.post.deletedAt ||
    (await blockedUserIdSet(user.id)).has(comment.userId)
  ) {
    return NextResponse.json({ error: "Conteúdo indisponível" }, { status: 404 });
  }
  if (comment.userId === user.id) {
    return NextResponse.json({ error: "Você não pode denunciar a si mesmo" }, { status: 400 });
  }

  const report = await prisma.postCommentReport.upsert({
    where: { commentId_reporterId: { commentId, reporterId: user.id } },
    create: { commentId, reporterId: user.id, reason: body.reason },
    update: { reason: body.reason, resolvedAt: null, resolvedById: null },
  });
  return NextResponse.json({ report: { id: report.id } }, { status: 201 });
}
