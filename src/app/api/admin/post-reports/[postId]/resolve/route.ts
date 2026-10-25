import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth/session";

type Params = { params: Promise<{ postId: string }> };

/**
 * Resolve TODAS as denúncias pendentes daquele post de uma vez — o admin
 * decide sobre o post, não denúncia por denúncia. `action: "remove"`
 * também soft-deleta o post; `"keep"` só limpa a fila.
 */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireStaff("moderation");
  if (!user) return response;

  const { postId } = await params;

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

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.postReport.updateMany({
      where: { postId, resolvedAt: null },
      data: { resolvedAt: now, resolvedById: user.id },
    }),
    ...(action === "remove"
      ? [prisma.post.update({ where: { id: postId }, data: { deletedAt: now } })]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}
