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
      animeTitleRomaji: report.post.animeTitleRomaji ?? "(sem obra associada)",
      body: report.post.body,
      postCreatedAt: report.post.createdAt,
      postDeleted: Boolean(report.post.deletedAt),
      author: report.post.user,
      reporters: [report.reporter],
    });
  }

  const grouped = [...byPost.values()];

  // Contexto que faltava antes do admin decidir "Remover" — sem isso, não
  // havia como saber que apagar este post (soft delete) derruba
  // silenciosamente o embed de citação/a faixa "Fulano repostou" pra quem
  // vê esse post embutido em outro card do feed (achado real da 23ª
  // rodada de auditoria, Epic 18). Uma consulta em lote pros posts desta
  // página (evita N+1). `quotedBy` filtra `deletedAt: null` — uma citação
  // já apagada não aparece em lugar nenhum do feed, então não é contexto
  // relevante; `repostedBy` não precisa do mesmo filtro porque a linha de
  // repost em si é hard-deleted ao desfazer (nunca soft-deleted).
  const postIds = grouped.map((g) => g.postId);
  const engagement = postIds.length
    ? await prisma.post.findMany({
        where: { id: { in: postIds } },
        select: {
          id: true,
          _count: { select: { repostedBy: true, quotedBy: { where: { deletedAt: null } } } },
        },
      })
    : [];
  const engagementById = new Map(engagement.map((e) => [e.id, e._count]));

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
      repostCount: engagementById.get(g.postId)?.repostedBy ?? 0,
      quoteCount: engagementById.get(g.postId)?.quotedBy ?? 0,
    })),
  });
}
