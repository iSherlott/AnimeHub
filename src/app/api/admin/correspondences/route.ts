import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { loadCorrespondences, parseCorrespondenceFilters } from "@/lib/correspondences";

export const dynamic = "force-dynamic";

/** Admin → Correspondências (Fase 6): importação do AniDB e obras só do AniDB com sugestão, numa lista só. */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const { rows, total, page, pages } = await loadCorrespondences(parseCorrespondenceFilters(new URL(request.url).searchParams));
  return NextResponse.json({ rows, total, page, pages }, { headers: { "Cache-Control": "no-store" } });
}
