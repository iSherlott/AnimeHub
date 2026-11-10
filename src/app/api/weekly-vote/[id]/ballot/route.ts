import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { castBallot, currentWeeklyVote } from "@/lib/weeklyVote";

type Params = { params: Promise<{ id: string }> };

/** `{ optionId }`: um voto por pessoa (dá para trocar enquanto a votação está aberta). */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { optionId?: unknown } | null;
  const result = await castBallot(user.id, id, typeof body?.optionId === "string" ? body.optionId : "");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ vote: await currentWeeklyVote(user.id) });
}
