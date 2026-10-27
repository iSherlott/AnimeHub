import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { activeTopicsForMember } from "@/lib/community";

export const dynamic = "force-dynamic";

/** Os tópicos com atividade mais recente nas comunidades da pessoa (lateral do Feed). */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({ topics: await activeTopicsForMember(user.id) }, { headers: { "Cache-Control": "no-store" } });
}
