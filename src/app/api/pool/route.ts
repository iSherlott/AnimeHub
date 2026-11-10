import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { currentPool } from "@/lib/seasonPool";

/** O bolão mais recente: obras da temporada, as minhas escolhas e o placar. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ pool: await currentPool(user.id) });
}
