import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";

/**
 * Fila de denúncias, agrupada por comentário (várias pessoas podem denunciar
 * o mesmo comentário) — resolver uma vez resolve todas as denúncias daquele
 * comentário de uma vez (ver POST .../resolve), então listar por comentário
 * já poupa o admin de processar duplicata uma a uma.
 */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const reports = await prisma.commentReport.findMany({
    where: { resolvedAt: null },
    include: {
      comment: { include: { user: { select: { displayName: true, email: true } } } },
      reporter: { select: { displayName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const byComment = new Map<
    string,
    {
      commentId: string;
      anilistId: number;
      body: string;
      commentCreatedAt: Date;
      commentDeleted: boolean;
      author: { displayName: string; email: string };
      reporters: { displayName: string; email: string }[];
    }
  >();

  for (const report of reports) {
    const existing = byComment.get(report.commentId);
    if (existing) {
      existing.reporters.push(report.reporter);
      continue;
    }
    byComment.set(report.commentId, {
      commentId: report.commentId,
      anilistId: report.comment.anilistId,
      body: report.comment.body,
      commentCreatedAt: report.comment.createdAt,
      commentDeleted: Boolean(report.comment.deletedAt),
      author: report.comment.user,
      reporters: [report.reporter],
    });
  }

  const grouped = [...byComment.values()];
  const anilistIds = [...new Set(grouped.map((g) => g.anilistId))];
  const titleByAnilistId = new Map(
    (
      await prisma.catalogEntry.findMany({
        where: { anilistId: { in: anilistIds } },
        select: { anilistId: true, titleRomaji: true },
      })
    ).map((c) => [c.anilistId as number, c.titleRomaji])
  );

  return NextResponse.json({
    reports: grouped.map((g) => ({
      commentId: g.commentId,
      anilistId: g.anilistId,
      animeTitle: titleByAnilistId.get(g.anilistId) ?? `AniList #${g.anilistId}`,
      body: g.body,
      commentCreatedAt: g.commentCreatedAt.toISOString(),
      commentDeleted: g.commentDeleted,
      author: g.author,
      reportCount: g.reporters.length,
      reporters: g.reporters,
    })),
  });
}
