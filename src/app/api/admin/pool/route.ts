import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { openPool } from "@/lib/seasonPool";

/** `{ season, seasonYear, closesAt, picksPerUser }`: abre o bolão da temporada. */
export async function POST(request: Request) {
  const { user, response } = await requireAdmin();
  if (!user) return response;
  const result = await openPool(user, (await request.json().catch(() => null)) ?? {});
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
