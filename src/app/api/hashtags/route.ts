import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canonicalHashtagKey } from "@/lib/hashtags";

const PER_KIND = 4;
const MAX_MATCHES = 5;

/**
 * Hashtags (leitura pública).
 *
 * - Sem parâmetros: populares agrupadas por tipo (OBRA · GÊNERO · TÓPICO) para
 *   a lateral "Conversas da temporada" da Comunidade (Figma `13:41368`). Só
 *   entram tags com ao menos uma publicação ativa.
 * - `?q=texto`: sugestões por prefixo do ID canônico para o campo Hashtags do
 *   editor (`13:41840`: "hashtag existente" × "usar novo tema").
 */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().replace(/^#/, "").slice(0, 40);

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
