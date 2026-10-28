import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canonicalHashtagKey } from "@/lib/hashtags";
import { requireUser } from "@/lib/auth/session";

const PER_KIND = 4;
const MAX_MATCHES = 5;
const TRENDING_DAYS = 7;
const TRENDING_LIMIT = 8;

/**
 * Hashtags (leitura pública).
 *
 * - Sem parâmetros: populares agrupadas por tipo (OBRA · GÊNERO · TÓPICO) para
 *   a lateral "Conversas da temporada" da Comunidade (Figma `13:41368`). Só
 *   entram tags com ao menos uma publicação ativa.
 * - `?q=texto`: sugestões por prefixo do ID canônico para o campo Hashtags do
 *   editor (`13:41840`: "hashtag existente" × "usar novo tema").
 * - `?trending=1`: "Em alta agora" do Feed — as hashtags com mais publicações nos últimos 7 dias (como no Twitter).
 */
export async function GET(request: Request) {
  // Sistema fechado: a parte social só abre para quem entrou.
  const { user: member, response: closed } = await requireUser();
  if (!member) return closed;
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().replace(/^#/, "").slice(0, 40);

  if (params.get("trending")) {
    const since = new Date(Date.now() - TRENDING_DAYS * 86_400_000);
    const counts = await prisma.postHashtag.groupBy({
      by: ["hashtagId"],
      where: { post: { deletedAt: null, createdAt: { gte: since } } },
      _count: { _all: true },
      orderBy: { _count: { hashtagId: "desc" } },
      take: TRENDING_LIMIT,
    });
    const tags = counts.length ? await prisma.hashtag.findMany({ where: { id: { in: counts.map((c) => c.hashtagId) } }, select: { id: true, key: true, display: true, kind: true } }) : [];
    const byId = new Map(tags.map((t) => [t.id, t]));
    const trending = counts.flatMap((c) => {
      const t = byId.get(c.hashtagId);
      return t ? [{ key: t.key, display: t.display, kind: t.kind, postCount: c._count._all }] : [];
    });
    return NextResponse.json({ trending, days: TRENDING_DAYS });
  }

  if (q) {
    const prefix = canonicalHashtagKey(q);
    const rows = await prisma.hashtag.findMany({
      where: { key: { startsWith: prefix } },
      select: { key: true, display: true, kind: true, _count: { select: { posts: { where: { post: { deletedAt: null } } } } } },
      take: 30,
    });
    const matches = rows
      .map((t) => ({ key: t.key, display: t.display, kind: t.kind, postCount: t._count.posts }))
      .filter((t) => t.postCount > 0)
      .sort((a, b) => b.postCount - a.postCount || a.key.localeCompare(b.key))
      .slice(0, MAX_MATCHES);
    return NextResponse.json({ matches });
  }

  const tags = await prisma.hashtag.findMany({
    select: { key: true, display: true, kind: true, _count: { select: { posts: { where: { post: { deletedAt: null } } } } } },
    take: 200,
  });
  const ranked = tags
    .map((t) => ({ key: t.key, display: t.display, kind: t.kind, postCount: t._count.posts }))
    .filter((t) => t.postCount > 0)
    .sort((a, b) => b.postCount - a.postCount || a.key.localeCompare(b.key));

  const groups: Record<string, Array<{ key: string; display: string }>> = { WORK: [], GENRE: [], TOPIC: [] };
  for (const t of ranked) {
    const bucket = groups[t.kind];
    if (bucket && bucket.length < PER_KIND) bucket.push({ key: t.key, display: t.display });
  }
  return NextResponse.json({ groups });
}
