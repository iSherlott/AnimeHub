import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canonicalHashtagKey } from "@/lib/hashtags";

type Params = { params: Promise<{ key: string }> };

/**
 * Dados da página de hashtag (Figma `13:42068`): nome de exibição, tipo,
 * contagem de publicações ativas e a lateral "Encontre outra conversa"
 * (outras hashtags populares agrupadas por tipo). Leitura pública.
 */
export async function GET(_request: Request, { params }: Params) {
  const { key: rawKey } = await params;
  const key = canonicalHashtagKey(decodeURIComponent(rawKey));
  const hashtag = await prisma.hashtag.findUnique({ where: { key } });
  if (!hashtag) {
    return NextResponse.json({ error: "Hashtag não encontrada" }, { status: 404 });
  }

  const [postCount, popular] = await Promise.all([
    prisma.postHashtag.count({ where: { hashtagId: hashtag.id, post: { deletedAt: null } } }),
    prisma.hashtag.findMany({
      where: { id: { not: hashtag.id } },
      orderBy: { posts: { _count: "desc" } },
      take: 24,
      select: { key: true, display: true, kind: true },
    }),
  ]);

  const byKind: Record<string, Array<{ key: string; display: string }>> = {};
  for (const h of popular) (byKind[h.kind] ||= []).push({ key: h.key, display: h.display });

  return NextResponse.json({
    hashtag: { key: hashtag.key, display: hashtag.display, kind: hashtag.kind, postCount },
    related: byKind,
  });
}
