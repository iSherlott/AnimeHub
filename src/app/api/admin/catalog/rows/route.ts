import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/session";
import { loadAdminCatalogPage, parseAdminCatalogFilters } from "@/lib/adminCatalog";

export const dynamic = "force-dynamic";

/**
 * Admin → Catálogo: a próxima página da lista (rolagem infinita). Mesmos filtros da página (`q`, `tipo`, `status`, `fonte`)
 * e `cursor` = quantas linhas já foram mostradas.
 */
export async function GET(request: Request) {
  const { user, response } = await requireStaff("catalog");
  if (!user) return response;
  const { searchParams } = new URL(request.url);
  const cursor = Number(searchParams.get("cursor"));
  const page = await loadAdminCatalogPage(parseAdminCatalogFilters(searchParams), Number.isInteger(cursor) && cursor > 0 ? cursor : 0);
  return NextResponse.json({ rows: page.rows, nextCursor: page.nextCursor, total: page.total }, { headers: { "Cache-Control": "no-store" } });
}
