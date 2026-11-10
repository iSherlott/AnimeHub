import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { openWeeklyVote, weeklyCandidates } from "@/lib/weeklyVote";

/** GET: as obras que entrariam (com episódio nos últimos 7 dias). POST `{ days, title? }`: abre a votação. */
export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  return NextResponse.json({ candidates: await weeklyCandidates() });
}

export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const result = await openWeeklyVote(user, (await request.json().catch(() => null)) ?? {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
