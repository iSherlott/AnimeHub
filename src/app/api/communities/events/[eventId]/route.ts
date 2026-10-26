import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { deleteEvent, rsvp } from "@/lib/community";

type Params = { params: Promise<{ eventId: string }> };

/** Presença no evento (membros): `{ status: "GOING" | "MAYBE" | null }`. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const result = await rsvp((await params).eventId, user.id, body?.status ?? null);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}

/** Apagar o evento: quem criou ou a moderação. */
export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const result = await deleteEvent((await params).eventId, { id: user.id, canModerate: can(user.role, "moderation") });
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}
