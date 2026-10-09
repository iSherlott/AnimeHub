import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const notification = await prisma.socialNotification.findUnique({ where: { id } });
  if (!notification || notification.userId !== user.id) {
    return NextResponse.json({ error: "Notificação não encontrada" }, { status: 404 });
  }
  await prisma.socialNotification.update({ where: { id }, data: { readAt: notification.readAt ?? new Date() } });
  return NextResponse.json({ ok: true });
}
