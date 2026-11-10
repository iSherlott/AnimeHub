import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { currentWeeklyVote } from "@/lib/weeklyVote";

/** O anime da semana: a votação aberta ou o último resultado. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ vote: await currentWeeklyVote(user.id) });
}
