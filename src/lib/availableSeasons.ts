import { prisma } from "@/lib/prisma";
import { NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import { seasonDisplayName, seasonSlug, type SeasonName, type SeasonRef } from "@/lib/exploreGroups";

/** Uma temporada que tem obras na plataforma. */
export type AvailableSeason = SeasonRef & { slug: string; label: string; count: number };

const ORDER: SeasonName[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

/**
 * As temporadas que têm anime na plataforma (obras trazidas pelo admin, sem conteúdo adulto), da mais recente à mais
 * antiga. É o que o filtro de temporada mostra: nada de opção vazia.
 */
export async function loadAvailableSeasons(): Promise<AvailableSeason[]> {
  const rows = await prisma.catalogEntry.groupBy({
    by: ["season", "seasonYear"],
    where: { onPlatform: true, season: { in: ORDER }, seasonYear: { not: null }, ...NOT_BLOCKED_GENRE },
    _count: { _all: true },
  });
  return rows
    .map((r) => {
      const ref: SeasonRef = { season: r.season as SeasonName, year: r.seasonYear as number };
      return { ...ref, slug: seasonSlug(ref), label: seasonDisplayName(ref), count: r._count._all };
    })
    .sort((a, b) => b.year - a.year || ORDER.indexOf(b.season) - ORDER.indexOf(a.season));
}
