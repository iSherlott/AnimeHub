import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import { annotateOwnership, discoverItemFromCatalogEntry } from "@/lib/discoverItem";

/**
 * Todo o catálogo da plataforma já salvo localmente (CatalogEntry com onPlatform) — usado pela tela
 * Descobrir para filtrar por gênero/ano instantaneamente no cliente, sem
 * depender da AniList estar no ar.
 */
export async function GET() {
  const user = await getCurrentUser();
  const entries = await prisma.catalogEntry.findMany({
    where: { onPlatform: true, ...NOT_BLOCKED_GENRE },
    orderBy: { titleRomaji: "asc" },
  });
  const results = await annotateOwnership(
    entries.map(discoverItemFromCatalogEntry),
    user?.id ?? null
  );
  return NextResponse.json({ results });
}
