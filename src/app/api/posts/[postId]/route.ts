import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ postId: string }> };

/** Autor apaga o próprio post — a qualquer momento, denunciado ou não. */
export async function DELETE(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { postId } = await params;
  const existing = await prisma.post.findUnique({
    where: { id: postId },
    select: { userId: true, deletedAt: true },
  });
  if (!existing || existing.userId !== user.id || existing.deletedAt) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }

  await prisma.post.update({
    where: { id: postId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
