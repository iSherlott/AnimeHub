import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { annotateOwnership, discoverItemFromCatalogEntry } from "@/lib/discoverItem";

/**
 * Todo o catálogo já salvo localmente (CatalogEntry) — usado pela tela
 * Descobrir para filtrar por gênero/ano instantaneamente no cliente, sem
 * depender da AniList estar no ar.
 */
export async function GET() {
  const user = await getCurrentUser();
  const entries = await prisma.catalogEntry.findMany({
    orderBy: { titleRomaji: "asc" },
  });
  const results = await annotateOwnership(
    entries.map(discoverItemFromCatalogEntry),
    user?.id ?? null
  );
  return NextResponse.json({ results });
}
