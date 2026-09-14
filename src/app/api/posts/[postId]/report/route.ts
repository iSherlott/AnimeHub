import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ postId: string }> };

/**
 * Denunciar não remove o post — só entra na fila que o administrador
 * revisa (GET/POST /api/admin/post-reports). Diferente do report de
 * comentário, não há checagem de posse: o feed é global, então qualquer
 * pessoa logada que vê o post pode denunciá-lo.
 */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { postId } = await params;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { deletedAt: true },
  });
  if (!post || post.deletedAt) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }

  // Idempotente e reabre a denúncia (limpa resolvedAt/resolvedById) se já
  // tinha sido resolvida — mesma correção de regressão do report de
  // comentário (Epic 15): sem isso, denunciar de novo um post que o admin
  // já tinha revisado (e mantido) nunca mais reaparecia na fila.
  const report = await prisma.postReport.upsert({
    where: { postId_reporterId: { postId, reporterId: user.id } },
    create: { postId, reporterId: user.id },
    update: { resolvedAt: null, resolvedById: null },
  });

  return NextResponse.json({ report: { id: report.id } }, { status: 201 });
}
