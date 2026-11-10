import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { upcomingEvents } from "@/lib/animeEvents";

/** Agenda de eventos de anime (próximos), com quantos vão e quais amigos vão. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ events: await upcomingEvents(user.id) });
}
