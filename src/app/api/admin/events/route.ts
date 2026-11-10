import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { validateEvent } from "@/lib/animeEvents";

/** Agenda de eventos (só o admin cadastra): GET lista todos (inclusive os passados); POST cria. */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const events = await prisma.animeEvent.findMany({ where: { deletedAt: null }, orderBy: { startsAt: "desc" }, take: 100, include: { _count: { select: { rsvps: true } } } });
  return NextResponse.json({ events });
}

export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const parsed = validateEvent((await request.json().catch(() => null)) ?? {});
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const event = await prisma.animeEvent.create({ data: { ...parsed.value, createdById: user.id } });
  await prisma.adminLog.create({ data: { level: "INFO", event: "Anime event created", message: `${user.displayName} cadastrou o evento "${event.title}".`, context: `event:${event.id}`, adminName: user.displayName } });
  return NextResponse.json({ event }, { status: 201 });
}
