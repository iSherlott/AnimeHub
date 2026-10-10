import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { toDtoPage, POST_ROW_INCLUDE } from "@/lib/postFeedDto";
import { canonicalHashtagKey } from "@/lib/hashtags";

type Params = { params: Promise<{ key: string }> };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** "Em alta" (Figma `13:42068`: critério e janela pendentes — D-12): proposta 72 h, interações = curtidas + respostas. */
const TRENDING_WINDOW_MS = 72 * 3600 * 1000;
const TRENDING_CANDIDATES = 200;

/**
 * Publicações de uma hashtag. `tab=recent` (padrão): cronológico com cursor
 * por id. `tab=trending`: atividade recente NESTA hashtag; o cursor é o
 * deslocamento (string) dentro do ranking. Spoiler, bloqueio e posts
 * apagados passam pelas mesmas regras de toda lista (toDtoPage).
 */
export async function GET(request: Request, { params }: Params) {
  const { key: rawKey } = await params;
  const key = canonicalHashtagKey(decodeURIComponent(rawKey));
  const hashtag = await prisma.hashtag.findUnique({ where: { key }, select: { id: true } });
  if (!hashtag) {
    // A página da hashtag existe para qualquer ID canônico; sem publicações, lista vazia.
    return NextResponse.json({ posts: [], nextCursor: null });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT));
  const cursor = searchParams.get("cursor");
  const viewer = await getCurrentUser();
  const viewerId = viewer?.id ?? null;

  if (searchParams.get("tab") === "trending") {
    const since = new Date(Date.now() - TRENDING_WINDOW_MS);
    const candidates = await prisma.post.findMany({
      where: { deletedAt: null, createdAt: { gte: since }, hashtags: { some: { hashtagId: hashtag.id } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: TRENDING_CANDIDATES,
      include: POST_ROW_INCLUDE,
    });
    const ranked = [...candidates].sort((a, b) => {
      const score = (p: (typeof candidates)[number]) => p._count.likes + p._count.comments;
      return score(b) - score(a) || b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);
    });
    const offset = Math.max(0, Number(cursor) || 0);
    const page = ranked.slice(offset, offset + limit);
    const nextCursor = offset + limit < ranked.length ? String(offset + limit) : null;
    return NextResponse.json({ posts: await toDtoPage(page, viewerId), nextCursor });
  }

  const rows = await prisma.post.findMany({
    where: { deletedAt: null, hashtags: { some: { hashtagId: hashtag.id } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: POST_ROW_INCLUDE,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({
    posts: await toDtoPage(page, viewerId),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
