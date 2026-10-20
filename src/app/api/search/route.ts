import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { blockedUserIdSet } from "@/lib/blocks";
import { toDtoPage, POST_ROW_INCLUDE } from "@/lib/postFeedDto";
import { canonicalHashtagKey } from "@/lib/hashtags";
import { clientIp, rateLimitedResponse } from "@/lib/rateLimit";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MIN_QUERY = 2;
/** Quantas hashtags casadas entram na classificação (a tela as mostra em páginas). */
const MAX_HASHTAGS = 500;
const MAX_QUERY = 80;

/**
 * Busca social com escopos (SOC-004, Figma `13:43738`): `scope=posts`
 * (Publicações), `profiles` (Perfis) ou `hashtags`. Leitura pública.
 *
 * - Publicações: casa pelo TEXTO; o corpo de publicações marcadas como
 *   spoiler nunca entra na busca (o resultado revelaria o conteúdo).
 *   Bloqueio e posts apagados passam pelas regras comuns (toDtoPage).
 * - Perfis: pelo nome de exibição; quem tem bloqueio com o viewer some.
 * - Hashtags: pelo ID canônico ou nome; ordenadas por publicações ativas.
 *
 * Consulta curta demais devolve 400 (a UI mostra a dica, não "sem resultados").
 */
export async function GET(request: Request) {
  const limited = rateLimitedResponse(`search:${clientIp(request)}`, 90, 60_000);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const scopeParam = searchParams.get("scope");
  const scope = scopeParam === "profiles" ? "profiles" : scopeParam === "hashtags" ? "hashtags" : "posts";
  const q = (searchParams.get("q") ?? "").trim().replace(/^[#@]/, "").slice(0, MAX_QUERY);
  if ([...q].length < MIN_QUERY) {
    return NextResponse.json({ error: `Digite pelo menos ${MIN_QUERY} caracteres` }, { status: 400 });
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT));
  const cursor = searchParams.get("cursor");
  const viewer = await getCurrentUser();
  const viewerId = viewer?.id ?? null;

  if (scope === "posts") {
    const rows = await prisma.post.findMany({
      where: { deletedAt: null, repostOfId: null, isSpoiler: false, body: { contains: q, mode: "insensitive" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: POST_ROW_INCLUDE,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      scope,
      posts: await toDtoPage(page, viewerId),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  }

  // Perfis e hashtags paginam por posição (`cursor` = quantos já foram): a tela rola e pede a página seguinte.
  const offset = Math.max(0, Number(cursor) || 0);

  if (scope === "profiles") {
    const blocked = [...(await blockedUserIdSet(viewerId))];
    const found = await prisma.user.findMany({
      where: {
        OR: [{ displayName: { contains: q, mode: "insensitive" } }, { handle: { contains: q.toLowerCase() } }],
        ...(blocked.length ? { id: { notIn: blocked } } : {}),
      },
      select: { id: true, displayName: true, handle: true, avatarUrl: true, bio: true },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit + 1,
    });
    const hasMoreProfiles = found.length > limit;
    const users = hasMoreProfiles ? found.slice(0, limit) : found;
    return NextResponse.json({ scope, profiles: users, nextCursor: hasMoreProfiles ? String(offset + limit) : null });
  }

  const key = canonicalHashtagKey(q);
  const tags = await prisma.hashtag.findMany({
    where: { OR: [{ key: { contains: key } }, { display: { contains: q, mode: "insensitive" } }] },
    select: { key: true, display: true, kind: true, _count: { select: { posts: { where: { post: { deletedAt: null } } } } } },
    take: MAX_HASHTAGS,
  });
  const ranked = tags
    .map((t) => ({ key: t.key, display: t.display, kind: t.kind, postCount: t._count.posts }))
    .filter((t) => t.postCount > 0)
    .sort((a, b) => b.postCount - a.postCount || a.key.localeCompare(b.key));
  const hashtags = ranked.slice(offset, offset + limit);
  return NextResponse.json({ scope, hashtags, nextCursor: offset + limit < ranked.length ? String(offset + limit) : null });
}
