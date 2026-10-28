import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canonicalHashtagKey } from "@/lib/hashtags";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ key: string }> };

/**
 * Dados da página de hashtag (Figma `13:42068`): nome de exibição, tipo,
 * contagem de publicações ativas e a lateral "Encontre outra conversa"
 * (outras hashtags populares agrupadas por tipo). Leitura pública.
 */
export async function GET(_request: Request, { params }: Params) {
  // Sistema fechado: a parte social só abre para quem entrou.
  const { user: member, response: closed } = await requireUser();
  if (!member) return closed;
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

  // "Obra em contexto" (Figma 13:42068): só para hashtags do tipo OBRA, pela
  // produção mais citada nas publicações explicitamente associadas.
  let work: { anilistId: number; titleNative: string | null; titleRomaji: string; titleEnglish: string | null; format: string | null; seasonNumber: number; seasonYear: number | null } | null = null;
  if (hashtag.kind === "WORK" || hashtag.anilistId !== null) {
    // Vínculo explícito (# das notícias) primeiro; senão, a obra mais citada nas publicações que a usam.
    let anilistId = hashtag.anilistId;
    if (anilistId === null) {
      const top = await prisma.post.groupBy({
        by: ["anilistId"],
        where: { deletedAt: null, anilistId: { not: null }, hashtags: { some: { hashtagId: hashtag.id } } },
        _count: { _all: true },
        orderBy: { _count: { anilistId: "desc" } },
        take: 1,
      });
      anilistId = top[0]?.anilistId ?? null;
    }
    if (anilistId) {
      const p = await prisma.production.findUnique({ where: { anilistId } });
      if (p) {
        work = {
          anilistId: p.anilistId,
          titleNative: p.titleNative,
          titleRomaji: p.titleRomaji,
          titleEnglish: p.titleEnglish,
          format: p.format,
          seasonNumber: p.seasonNumber,
          seasonYear: p.seasonYear,
        };
      } else {
        // Obra do catálogo da temporada que ainda não tem produção: a página dela abre (e cria a produção) em /obra/<id>.
        const c = await prisma.catalogEntry.findUnique({ where: { anilistId } });
        if (c) {
          work = { anilistId, titleNative: c.titleNative, titleRomaji: c.titleRomaji, titleEnglish: c.titleEnglish, format: null, seasonNumber: 1, seasonYear: c.seasonYear };
        }
      }
    }
  }

  const byKind: Record<string, Array<{ key: string; display: string }>> = {};
  for (const h of popular) (byKind[h.kind] ||= []).push({ key: h.key, display: h.display });

  return NextResponse.json({
    hashtag: { key: hashtag.key, display: hashtag.display, kind: hashtag.kind, postCount },
    related: byKind,
    work,
  });
}
