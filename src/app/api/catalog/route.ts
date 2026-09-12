import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { discoverItemFromCatalogEntry } from "@/lib/discoverItem";

/**
 * Todo o catálogo já salvo localmente (CatalogEntry) — usado pela tela
 * Descobrir para filtrar por gênero/ano instantaneamente no cliente, sem
 * depender da AniList estar no ar.
 */
export async function GET() {
  const entries = await prisma.catalogEntry.findMany({
    orderBy: { titleRomaji: "asc" },
  });
  return NextResponse.json({ results: entries.map(discoverItemFromCatalogEntry) });
}
