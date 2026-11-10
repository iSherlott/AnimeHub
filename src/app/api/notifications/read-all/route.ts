import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { markSystemAlertsRead } from "@/lib/systemAlerts";

/** "Marcar todas como lidas" (topo do sino): todos os canais de uma vez — Lançamentos, Social e, para admin, Sistema. */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const now = new Date();
  const [alerts, social] = await prisma.$transaction([
    prisma.airingAlert.updateMany({ where: { userId: user.id, seenAt: null }, data: { seenAt: now } }),
    prisma.socialNotification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: now } }),
  ]);
  const system = user.role === "ADMIN" ? await markSystemAlertsRead(user.id) : 0;
  return NextResponse.json({ ok: true, alerts: alerts.count, social: social.count, system });
}
