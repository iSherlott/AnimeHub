import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { openProfileReports } from "@/lib/profileSocial";

export const dynamic = "force-dynamic";

/** Fila de denúncias de recados e depoimentos (moderação). */
export async function GET() {
  const { user, response } = await requireStaff("moderation");
  if (!user) return response;
  return NextResponse.json({ reports: await openProfileReports() }, { headers: { "Cache-Control": "no-store" } });
}
