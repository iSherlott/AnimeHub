import { prisma } from "@/lib/prisma";
import { blockedUserIdSet } from "@/lib/blocks";

/**
 * Agenda de eventos de anime (10/11/2026): convenções, estreias no cinema, lives. Só o admin cadastra (os disparos ficam
 * no painel, pensando em parcerias no futuro). Quem tem conta marca "vou" e ganha um lembrete no sino no dia do evento.
 */
export const EVENT_KINDS = { CONVENCAO: "Convenção", CINEMA: "Cinema", LIVE: "Live", OUTRO: "Outro" } as const;
export type EventKind = keyof typeof EVENT_KINDS;

export type EventInput = { title?: unknown; description?: unknown; kind?: unknown; startsAt?: unknown; endsAt?: unknown; place?: unknown; url?: unknown; partner?: unknown };
export type EventData = { title: string; description: string | null; kind: EventKind; startsAt: Date; endsAt: Date | null; place: string | null; url: string | null; partner: string | null };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function validateEvent(input: EventInput): { ok: true; value: EventData } | { ok: false; error: string } {
  const title = text(input.title, 120);
  if (!title) return { ok: false, error: "Dê um nome ao evento." };
  const kind = typeof input.kind === "string" && input.kind in EVENT_KINDS ? (input.kind as EventKind) : "OUTRO";
  const startsAt = typeof input.startsAt === "string" ? new Date(input.startsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) return { ok: false, error: "Informe quando o evento começa." };
  const endsAt = typeof input.endsAt === "string" && input.endsAt ? new Date(input.endsAt) : null;
  if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt < startsAt)) return { ok: false, error: "O fim precisa ser depois do começo." };
  const url = text(input.url, 500);
  if (url && !/^https?:\/\//i.test(url)) return { ok: false, error: "O link precisa começar com http:// ou https://." };
  return { ok: true, value: { title, description: text(input.description, 2000) || null, kind, startsAt, endsAt, place: text(input.place, 200) || null, url: url || null, partner: text(input.partner, 120) || null } };
}

export type EventView = {
  id: string;
  title: string;
  description: string | null;
  kind: EventKind;
  kindLabel: string;
  startsAt: string;
  endsAt: string | null;
  place: string | null;
  url: string | null;
  partner: string | null;
  going: number;
  friendsGoing: string[];
  mine: boolean;
};

/** Eventos que ainda não acabaram (os próximos primeiro), com quantos vão e quais amigos vão. */
export async function upcomingEvents(viewerId: string | null, now = new Date(), take = 30): Promise<EventView[]> {
  const rows = await prisma.animeEvent.findMany({
    where: { deletedAt: null, OR: [{ endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } }] },
    orderBy: { startsAt: "asc" },
    take,
    include: { rsvps: { select: { userId: true } } },
  });
  let friendNames = new Map<string, string>();
  if (viewerId) {
    const [links, blocked] = await Promise.all([
      prisma.friendship.findMany({ where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] }, select: { userAId: true, userBId: true } }),
      blockedUserIdSet(viewerId),
    ]);
    const ids = links.map((l) => (l.userAId === viewerId ? l.userBId : l.userAId)).filter((id) => !blocked.has(id));
    if (ids.length) friendNames = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  }
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    kind: (e.kind in EVENT_KINDS ? e.kind : "OUTRO") as EventKind,
    kindLabel: EVENT_KINDS[(e.kind in EVENT_KINDS ? e.kind : "OUTRO") as EventKind],
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    place: e.place,
    url: e.url,
    partner: e.partner,
    going: e.rsvps.length,
    friendsGoing: e.rsvps.flatMap((r) => (friendNames.has(r.userId) ? [friendNames.get(r.userId) as string] : [])),
    mine: viewerId ? e.rsvps.some((r) => r.userId === viewerId) : false,
  }));
}

/** "Vou" / "Não vou mais". */
export async function toggleRsvp(eventId: string, userId: string, going: boolean): Promise<{ ok: true; going: number } | { ok: false; status: 404; error: string }> {
  const event = await prisma.animeEvent.findFirst({ where: { id: eventId, deletedAt: null }, select: { id: true } });
  if (!event) return { ok: false, status: 404, error: "Evento não encontrado." };
  if (going) await prisma.animeEventRsvp.upsert({ where: { eventId_userId: { eventId, userId } }, create: { eventId, userId }, update: {} });
  else await prisma.animeEventRsvp.deleteMany({ where: { eventId, userId } });
  return { ok: true, going: await prisma.animeEventRsvp.count({ where: { eventId } }) };
}

/** "YYYY-MM-DD" no fuso da pessoa. */
function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

/**
 * Lembrete no sino no dia do evento, para quem marcou "vou": nasce quando o sino é consultado (como os aniversários),
 * uma vez por evento. Nunca lança.
 */
export async function ensureEventReminders(userId: string, timeZone: string, now = new Date()): Promise<void> {
  try {
    const rsvps = await prisma.animeEventRsvp.findMany({
      where: { userId, remindedAt: null, event: { deletedAt: null, startsAt: { gte: new Date(now.getTime() - 36 * 3600 * 1000), lte: new Date(now.getTime() + 36 * 3600 * 1000) } } },
      include: { event: { select: { id: true, startsAt: true, createdById: true } } },
    });
    const today = dayKey(now, timeZone);
    for (const r of rsvps) {
      if (dayKey(r.event.startsAt, timeZone) !== today) continue;
      await prisma.$transaction([
        prisma.socialNotification.create({ data: { userId, actorId: r.event.createdById ?? userId, type: "EVENT_REMINDER", animeEventId: r.event.id } }),
        prisma.animeEventRsvp.update({ where: { eventId_userId: { eventId: r.eventId, userId } }, data: { remindedAt: now } }),
      ]);
    }
  } catch (error) {
    console.error("[animeEvents] lembrete falhou:", error);
  }
}
