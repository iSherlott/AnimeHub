import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { toggleRsvp } from "@/lib/animeEvents";

type Params = { params: Promise<{ id: string }> };

/** `{ going: true | false }`: "vou" ou "não vou mais". Quem vai ganha um lembrete no sino no dia. */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { going?: unknown } | null;
  const result = await toggleRsvp(id, user.id, body?.going !== false);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ going: result.going });
}
