import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

/** "Marcar todas como lidas" (topo do sino): os dois canais de uma vez — Lançamentos e Social. */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const now = new Date();
  const [alerts, social] = await prisma.$transaction([
    prisma.airingAlert.updateMany({ where: { userId: user.id, seenAt: null }, data: { seenAt: now } }),
    prisma.socialNotification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: now } }),
  ]);
  return NextResponse.json({ ok: true, alerts: alerts.count, social: social.count });
}
