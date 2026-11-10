import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { isAlertVisible } from "@/lib/alertVisibility";
import { resolveTimeZone } from "@/lib/timeZone";

/**
 * Marca como vistos os avisos de uma obra (`{ anilistId }`): abrir a prévia dela no calendário já é ver a novidade, sem
 * precisar ir ao sino depois. Só os avisos que o sino mostra agora; o do episódio de amanhã continua para amanhã.
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  let body: { anilistId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const anilistId = Number(body.anilistId);
  if (!Number.isInteger(anilistId) || anilistId <= 0) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });

  const now = new Date();
  const [unseen, me] = await Promise.all([
    prisma.airingAlert.findMany({ where: { userId: user.id, anilistId, seenAt: null }, select: { id: true, kind: true, previousAiringAt: true, airingAt: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { timeZone: true } }),
  ]);
  const zone = resolveTimeZone(me?.timeZone);
  const ids = unseen.filter((a) => isAlertVisible(a, now, zone)).map((a) => a.id);
  if (ids.length > 0) await prisma.airingAlert.updateMany({ where: { id: { in: ids }, userId: user.id }, data: { seenAt: now } });
  return NextResponse.json({ ok: true, seen: ids.length });
}
