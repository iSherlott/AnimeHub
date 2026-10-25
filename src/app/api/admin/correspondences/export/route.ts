import { requireStaff } from "@/lib/auth/session";
import { loadCorrespondences, parseCorrespondenceFilters, toCsv } from "@/lib/correspondences";

export const dynamic = "force-dynamic";

/** Exporta as correspondências do filtro (todas as páginas) em CSV. */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const { all } = await loadCorrespondences(parseCorrespondenceFilters(new URL(request.url).searchParams));
  return new Response(`﻿${toCsv(all)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="correspondencias-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
