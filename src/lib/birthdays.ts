import { prisma } from "@/lib/prisma";
import { blockedUserIdSet } from "@/lib/blocks";
import { DEFAULT_TIME_ZONE, startOfDayInZone } from "@/lib/timeZone";
import { upcomingBirthdayKeys } from "@/lib/birthdayDates";

export { formatBirthday, MONTHS, validateBirthday } from "@/lib/birthdayDates";

/**
 * Aniversários (perfil estilo Orkut): só dia e mês, sem o ano. Só amigos veem a data; os aniversariantes aparecem na
 * página Amigos e na lateral do Feed, e o sino avisa no dia ("Hoje é aniversário de …"). Quem nasceu em 29/02 faz
 * aniversário em 28/02 nos anos que não são bissextos. "Hoje" é o dia no fuso de quem vê.
 */
export type BirthdayPerson = { id: string; displayName: string; handle: string | null; avatarUrl: string | null; birthDay: number; birthMonth: number; inDays: number };

/** Amigos com aniversário de hoje até `days - 1` dias, do mais próximo ao mais distante (sem bloqueios). */
export async function friendsBirthdays(viewerId: string, timeZone: string = DEFAULT_TIME_ZONE, days = 7, now: Date = new Date()): Promise<BirthdayPerson[]> {
  const [friendships, blocked] = await Promise.all([
    prisma.friendship.findMany({ where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] }, select: { userAId: true, userBId: true } }),
    blockedUserIdSet(viewerId),
  ]);
  const ids = friendships.map((f) => (f.userAId === viewerId ? f.userBId : f.userAId)).filter((id) => !blocked.has(id));
  if (ids.length === 0) return [];
  const keys = upcomingBirthdayKeys(now, timeZone, days);
  const rows = await prisma.user.findMany({
    where: { id: { in: ids }, OR: keys.map((k) => ({ birthDay: k.day, birthMonth: k.month })) },
    select: { id: true, displayName: true, handle: true, avatarUrl: true, birthDay: true, birthMonth: true },
  });
  return rows
    .flatMap((r) => {
      const key = keys.find((k) => k.day === r.birthDay && k.month === r.birthMonth);
      return key && r.birthDay && r.birthMonth ? [{ ...r, birthDay: r.birthDay, birthMonth: r.birthMonth, inDays: key.inDays }] : [];
    })
    .sort((a, b) => a.inDays - b.inDays || a.displayName.localeCompare(b.displayName, "pt-BR"));
}

/**
 * Cria os avisos de aniversário de hoje (um por amigo por dia), quando o sino é consultado. Respeita a preferência de
 * amizade e seguidores (`notifyFollowers`).
 */
export async function ensureBirthdayNotifications(userId: string, timeZone: string = DEFAULT_TIME_ZONE, now: Date = new Date()): Promise<void> {
  try {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { notifyFollowers: true } });
    if (!me?.notifyFollowers) return;
    const today = (await friendsBirthdays(userId, timeZone, 1, now)).map((p) => p.id);
    if (today.length === 0) return;
    const since = startOfDayInZone(now, timeZone);
    const already = new Set((await prisma.socialNotification.findMany({ where: { userId, type: "FRIEND_BIRTHDAY", actorId: { in: today }, createdAt: { gte: since } }, select: { actorId: true } })).map((n) => n.actorId));
    const fresh = today.filter((id) => !already.has(id));
    if (fresh.length) await prisma.socialNotification.createMany({ data: fresh.map((actorId) => ({ userId, actorId, type: "FRIEND_BIRTHDAY" })) });
  } catch (error) {
    console.error("[birthdays] falhou:", error);
  }
}
