import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { blockedUserIdSet } from "@/lib/blocks";

type Params = { params: Promise<{ postId: string }> };

/**
 * Revela o texto/imagens de uma publicação marcada como spoiler (P-12).
 * O feed e as demais listas NÃO enviam esse conteúdo — só quem pede aqui,
 * por ação explícita. Leitura pública (como o resto do feed); post apagado
 * ou inexistente responde igual (404), sem revelar motivo.
 */
export async function GET(_request: Request, { params }: Params) {
  // Sistema fechado: a parte social só abre para quem entrou.
  const { user: member, response: closed } = await requireUser();
  if (!member) return closed;
  const { postId } = await params;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { body: true, imageUrls: true, imageAlts: true, deletedAt: true, isSpoiler: true, userId: true },
  });
  const viewer = await getCurrentUser();
  if (!post || post.deletedAt || (await blockedUserIdSet(viewer?.id ?? null)).has(post.userId)) {
    return NextResponse.json({ error: "Conteúdo indisponível" }, { status: 404 });
  }
  return NextResponse.json({ body: post.body, imageUrls: post.imageUrls, imageAlts: post.imageUrls.map((_, i) => post.imageAlts[i] ?? "") });
}
