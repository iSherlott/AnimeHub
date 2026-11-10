import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { friendActivityFor } from "@/lib/friendActivity";

/** "Atividade dos amigos" da lateral do Feed: o que os amigos que compartilham terminaram e as notas que deram. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ activity: await friendActivityFor(user.id) });
}
