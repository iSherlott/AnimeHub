import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { loadWorksPage, parseWorksFilters } from "@/lib/adminWorks";

export const dynamic = "force-dynamic";

/** Admin → Catálogo de obras (Fase 3): a lista canônica, paginada e filtrada no servidor (os mesmos filtros da página). */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const filters = parseWorksFilters(new URL(request.url).searchParams);
  return NextResponse.json(await loadWorksPage(filters), { headers: { "Cache-Control": "no-store" } });
}
