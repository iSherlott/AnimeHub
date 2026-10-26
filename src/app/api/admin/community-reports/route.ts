import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { openReports } from "@/lib/community";

export const dynamic = "force-dynamic";

/** Fila de denúncias das comunidades (moderação). */
export async function GET() {
  const { user, response } = await requireStaff("moderation");
  if (!user) return response;
  return NextResponse.json({ reports: await openReports() }, { headers: { "Cache-Control": "no-store" } });
}
