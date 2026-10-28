import { NextResponse } from "next/server";
import { loadCatalogFacets } from "@/lib/catalogServer";

export const dynamic = "force-dynamic";

/**
 * O que existe no catálogo para montar os filtros do Explorar sem baixar as obras (ver `loadCatalogFacets`). A página do
 * Explorar já vem com isso do servidor; a rota fica para quem precisar depois.
 */
export async function GET() {
  return NextResponse.json(await loadCatalogFacets(), { headers: { "Cache-Control": "no-store" } });
}
