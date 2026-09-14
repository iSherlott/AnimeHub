import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";

/**
 * Fila de denúncias, agrupada por post (várias pessoas podem denunciar o
 * mesmo post) — resolver uma vez resolve todas as denúncias daquele post
 * de uma vez (ver POST .../resolve). Sem lookup de título em CatalogEntry
 * — animeTitleRomaji já está congelado no próprio Post.
 */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const reports = await prisma.postReport.findMany({
    where: { resolvedAt: null },
    include: {
      post: { include: { user: { select: { displayName: true, email: true } } } },
      reporter: { select: { displayName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const byPost = new Map<
    string,
    {
      postId: string;
      animeTitleRomaji: string;
      body: string;
      postCreatedAt: Date;
      postDeleted: boolean;
      author: { displayName: string; email: string };
      reporters: { displayName: string; email: string }[];
    }
  >();

  for (const report of reports) {
    const existing = byPost.get(report.postId);
    if (existing) {
      existing.reporters.push(report.reporter);
      continue;
    }
    byPost.set(report.postId, {
      postId: report.postId,
      animeTitleRomaji: report.post.animeTitleRomaji,
      body: report.post.body,
      postCreatedAt: report.post.createdAt,
      postDeleted: Boolean(report.post.deletedAt),
      author: report.post.user,
      reporters: [report.reporter],
    });
  }

  const grouped = [...byPost.values()];

  return NextResponse.json({
    reports: grouped.map((g) => ({
      postId: g.postId,
      animeTitleRomaji: g.animeTitleRomaji,
      body: g.body,
      postCreatedAt: g.postCreatedAt.toISOString(),
      postDeleted: g.postDeleted,
      author: g.author,
      reportCount: g.reporters.length,
      reporters: g.reporters,
    })),
  });
}
