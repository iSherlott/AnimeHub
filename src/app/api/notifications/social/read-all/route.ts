import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

/** "Marcar Social como lido": só o canal Social; Lançamentos não é tocado. */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await prisma.socialNotification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, updated: result.count });
}
