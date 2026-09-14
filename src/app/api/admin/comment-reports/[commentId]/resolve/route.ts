import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";

type Params = { params: Promise<{ commentId: string }> };

/**
 * Resolve TODAS as denúncias pendentes daquele comentário de uma vez — o
 * admin decide sobre o comentário, não denúncia por denúncia. `action:
 * "remove"` também soft-deleta o comentário; `"keep"` só limpa a fila.
 */
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
  const action = body.action;
  if (action !== "keep" && action !== "remove") {
    return NextResponse.json({ error: "action deve ser 'keep' ou 'remove'" }, { status: 400 });
  }

  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true } });
  if (!comment) {
    return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
  }

  const now = new Date();
  // As duas escritas precisam ser atômicas — sem transação, um crash entre
  // elas deixaria denúncias marcadas como resolvidas com o comentário ainda
  // de pé (ação "remove" que na prática não removeu nada).
  await prisma.$transaction([
    prisma.commentReport.updateMany({
      where: { commentId, resolvedAt: null },
      data: { resolvedAt: now, resolvedById: user.id },
    }),
    ...(action === "remove"
      ? [prisma.comment.update({ where: { id: commentId }, data: { deletedAt: now } })]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}
