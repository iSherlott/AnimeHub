import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type CommentGroup = {
  anilistId: number;
  _count: { id: number };
  _max?: { createdAt: Date | null };
};

type ThreadSummary = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  coverImage: string | null;
  commentCount: number;
  lastCommentAt: string | null;
};

const LIMIT = 5;

/**
 * Comment (Epic 15) não guarda título/capa — é chaveado só por anilistId.
 * Qualquer linha de Anime com esse anilistId serve (comentar exige ter o
 * anime na própria lista, então sempre existe pelo menos 1 quando há
 * comentário) — mas se todo mundo que comentou já removeu o anime da
 * própria lista depois, pode não sobrar nenhuma; nesse caso o chamador
 * descarta essa entrada em vez de mostrar um anilistId cru sem nome.
 */
async function resolveAnimeMeta(anilistId: number) {
  return prisma.anime.findFirst({
    where: { anilistId },
    select: { titleRomaji: true, titleEnglish: true, coverImage: true },
    orderBy: { createdAt: "asc" },
  });
}

async function toSummaries(groups: CommentGroup[]): Promise<ThreadSummary[]> {
  const resolved = await Promise.all(
    groups.map(async (g) => {
      const anime = await resolveAnimeMeta(g.anilistId);
      if (!anime) return null;
      const summary: ThreadSummary = {
        anilistId: g.anilistId,
        titleRomaji: anime.titleRomaji,
        titleEnglish: anime.titleEnglish,
        coverImage: anime.coverImage,
        commentCount: g._count.id,
        lastCommentAt: g._max?.createdAt?.toISOString() ?? null,
      };
      return summary;
    })
  );
  return resolved.filter((r): r is ThreadSummary => r !== null);
}

/**
 * Lateral do Feed (Epic 25) — "trending topics" de THREAD DE ANIME (Epic
 * 15), não de post do Feed (Epic 24). Pública, sem login, mesma
 * filosofia do resto do Feed.
 */
export async function GET() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [recentGroups, todayGroups] = await Promise.all([
    prisma.comment.groupBy({
      by: ["anilistId"],
      where: { deletedAt: null },
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: LIMIT,
    }),
    prisma.comment.groupBy({
      by: ["anilistId"],
      where: { deletedAt: null, createdAt: { gte: todayStart } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: LIMIT,
    }),
  ]);

  const [recent, mostCommentedToday] = await Promise.all([
    toSummaries(recentGroups),
    toSummaries(todayGroups),
  ]);

  return NextResponse.json({ recent, mostCommentedToday });
}
