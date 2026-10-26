import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { createEvent, scopeForKey } from "@/lib/community";
import { rateLimitedResponse } from "@/lib/rateLimit";

type Params = { params: Promise<{ key: string }> };

/** Novo evento (membros): `{ title, description, startsAt (ISO com fuso), endsAt?, place? }`. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const limited = rateLimitedResponse(`community-event:${user.id}`, 10, 10 * 60_000);
  if (limited) return limited;
  const scope = await scopeForKey((await params).key);
  if (!scope) return NextResponse.json({ error: "Comunidade não encontrada." }, { status: 404 });
  const result = await createEvent(scope, user.id, await request.json().catch(() => null));
  return result.ok ? NextResponse.json({ eventId: result.eventId }, { status: 201 }) : NextResponse.json({ error: result.error, errors: result.errors }, { status: result.status });
}
