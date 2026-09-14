import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ commentId: string }> };

/**
 * Denunciar não remove o comentário — só entra na fila que o administrador
 * revisa (GET/POST /api/admin/comment-reports). Só quem também tem esse
 * mesmo anime na lista pode denunciar, mesma regra de quem pode ver o
 * comentário em primeiro lugar.
 */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { commentId } = await params;
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { anilistId: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) {
    return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
  }

  const ownsAnime = await prisma.anime.findFirst({
    where: { userId: user.id, anilistId: comment.anilistId },
    select: { id: true },
  });
  if (!ownsAnime) {
    return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
  }

  // Idempotente — denunciar de novo algo que a mesma pessoa já denunciou não
  // é erro, só não duplica a entrada na fila do admin.
  const report = await prisma.commentReport.upsert({
    where: { commentId_reporterId: { commentId, reporterId: user.id } },
    create: { commentId, reporterId: user.id },
    update: {},
  });

  return NextResponse.json({ report: { id: report.id } }, { status: 201 });
}
