import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { friendsBirthdays } from "@/lib/birthdays";
import { resolveTimeZone } from "@/lib/timeZone";

export const dynamic = "force-dynamic";

/** Aniversários dos amigos de hoje aos próximos 7 dias (no fuso da conta). Lateral do Feed. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ birthdays: await friendsBirthdays(user.id, resolveTimeZone(user.timeZone)) }, { headers: { "Cache-Control": "no-store" } });
}
