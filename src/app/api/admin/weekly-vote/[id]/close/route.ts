import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { closeWeeklyVote } from "@/lib/weeklyVote";

type Params = { params: Promise<{ id: string }> };

/** Encerra a votação; o NewsHub publica o resultado no Feed. */
export async function POST(_request: Request, { params }: Params) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const { id } = await params;
  const result = await closeWeeklyVote(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
