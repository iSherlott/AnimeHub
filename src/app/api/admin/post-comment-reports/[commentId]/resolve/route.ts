import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";

type Params = { params: Promise<{ commentId: string }> };

/** Resolve todas as denúncias pendentes de uma resposta; `remove` também a apaga (soft delete). */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const { commentId } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  if (!body || (body.action !== "keep" && body.action !== "remove")) {
    return NextResponse.json({ error: "action deve ser 'keep' ou 'remove'" }, { status: 400 });
  }

  const comment = await prisma.postComment.findUnique({ where: { id: commentId }, select: { id: true } });
  if (!comment) {
    return NextResponse.json({ error: "Resposta não encontrada" }, { status: 404 });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.postCommentReport.updateMany({
      where: { commentId, resolvedAt: null },
      data: { resolvedAt: now, resolvedById: user.id },
    }),
    ...(body.action === "remove"
      ? [prisma.postComment.update({ where: { id: commentId }, data: { deletedAt: now } })]
      : []),
  ]);
  return NextResponse.json({ ok: true });
}
