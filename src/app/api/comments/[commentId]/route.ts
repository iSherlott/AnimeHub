import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ commentId: string }> };

/** Autor apaga o próprio comentário — a qualquer momento, denunciado ou não. */
export async function DELETE(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { commentId } = await params;
  const existing = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { userId: true, deletedAt: true },
  });
  if (!existing || existing.userId !== user.id || existing.deletedAt) {
    return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
