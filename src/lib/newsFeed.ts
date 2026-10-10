import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const NEWS_PAGE_SIZE = 20;
export type NewsScope = "all" | "following";

export type NewsItemDTO = {
  id: string;
  anilistId: number;
  url: string;
  title: string;
  excerpt: string | null;
  imageUrl: string | null;
  author: string | null;
  publishedAt: string;
  source: string;
  anime: { titleRomaji: string; titleEnglish: string | null; titleNative: string | null; coverImage: string | null } | null;
};

/** Notícias por escopo ("que sigo" × todas) e busca (título/trecho da notícia ou título da obra), da mais nova à mais antiga. */
export async function listNews(options: { scope: NewsScope; userId: string | null; q: string; before: Date | null }): Promise<{ items: NewsItemDTO[]; nextBefore: string | null }> {
  const and: Prisma.AnimeNewsWhereInput[] = [];

  if (options.scope === "following") {
    const followed = options.userId ? await prisma.anime.findMany({ where: { userId: options.userId }, select: { anilistId: true } }) : [];
    and.push({ anilistId: { in: followed.map((f) => f.anilistId) } });
  }

  const q = options.q.trim().slice(0, 80);
  if (q) {
    const matches = await prisma.catalogEntry.findMany({
      where: {
        anilistId: { not: null },
        OR: [
          { titleRomaji: { contains: q, mode: "insensitive" } },
          { titleEnglish: { contains: q, mode: "insensitive" } },
          { titleNative: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { anilistId: true },
      take: 200,
    });
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { excerpt: { contains: q, mode: "insensitive" } },
        { anilistId: { in: matches.map((m) => m.anilistId).filter((id): id is number => id !== null) } },
      ],
    });
  }
  if (options.before) and.push({ publishedAt: { lt: options.before } });

  const rows = await prisma.animeNews.findMany({ where: { AND: and }, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], take: NEWS_PAGE_SIZE + 1 });
  const page = rows.slice(0, NEWS_PAGE_SIZE);

  const ids = Array.from(new Set(page.map((r) => r.anilistId)));
  const entries = ids.length ? await prisma.catalogEntry.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true, coverImage: true } }) : [];
  const byId = new Map(entries.map((e) => [e.anilistId, e]));

  return {
    items: page.map((r) => {
      const anime = byId.get(r.anilistId);
      return {
        id: r.id,
        anilistId: r.anilistId,
        url: r.url,
        title: r.title,
        excerpt: r.excerpt,
        imageUrl: r.imageUrl,
        author: r.author,
        publishedAt: r.publishedAt.toISOString(),
        source: r.source,
        anime: anime ? { titleRomaji: anime.titleRomaji, titleEnglish: anime.titleEnglish, titleNative: anime.titleNative, coverImage: anime.coverImage } : null,
      };
    }),
    nextBefore: rows.length > NEWS_PAGE_SIZE ? page[page.length - 1].publishedAt.toISOString() : null,
  };
}
