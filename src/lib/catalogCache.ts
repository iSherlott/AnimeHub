import { prisma } from "@/lib/prisma";
import { fuzzyDateToISO, type AniListMedia } from "@/lib/anilist";
import type { CatalogEntry } from "@prisma/client";

function anilistToCatalogData(media: AniListMedia, popularityRank: number | null) {
  const startDateISO = fuzzyDateToISO(media.startDate);
  const endDateISO = fuzzyDateToISO(media.endDate);

  return {
    anilistId: media.id,
    titleRomaji: media.title.romaji,
    titleEnglish: media.title.english,
    titleNative: media.title.native,
    coverImage: media.coverImage.large,
    bannerImage: media.bannerImage,
    description: media.description,
    episodes: media.episodes,
    status: media.status,
    season: media.season,
    seasonYear: media.seasonYear,
    genres: media.genres.join(","),
    startDate: startDateISO ? new Date(startDateISO) : null,
    endDate: endDateISO ? new Date(endDateISO) : null,
    nextEpisodeNumber: media.nextAiringEpisode?.episode ?? null,
    nextEpisodeAt: media.nextAiringEpisode
      ? new Date(media.nextAiringEpisode.airingAt * 1000)
      : null,
    popularityRank,
    source: "anilist",
  };
}

/**
 * Salva/atualiza no cache sempre que a AniList responde com sucesso.
 * `rankFromOrder`: quando a lista já vem ordenada por popularidade (ex.: a
 * busca de temporada usa sort: POPULARITY_DESC), guarda a posição pra
 * alimentar a fileira "Em alta" — não faz sentido pra resultado de busca
 * livre, que não é um ranking.
 */
export async function cacheAniListMedia(
  list: AniListMedia[],
  { rankFromOrder = false }: { rankFromOrder?: boolean } = {}
): Promise<void> {
  for (let i = 0; i < list.length; i++) {
    const media = list[i];
    const data = anilistToCatalogData(media, rankFromOrder ? i + 1 : null);
    await prisma.catalogEntry.upsert({
      where: { anilistId: media.id },
      create: data,
      update: data,
    });
  }
}

/**
 * Prioriza o que bate exatamente com a temporada pedida; completa o resto
 * com o restante do cache (mais recente primeiro) até 24 itens, pra fileira
 * de "Descobrir" nunca ficar vazia/curta enquanto a AniList tá fora do ar.
 */
export async function getCachedSeason(
  season: string,
  seasonYear: number
): Promise<CatalogEntry[]> {
  const TOTAL = 24;

  const exact = await prisma.catalogEntry.findMany({
    where: { season, seasonYear },
    orderBy: { titleRomaji: "asc" },
  });
  if (exact.length >= TOTAL) return exact;

  const rest = await prisma.catalogEntry.findMany({
    where: { NOT: { id: { in: exact.map((e) => e.id) } } },
    orderBy: { updatedAt: "desc" },
    take: TOTAL - exact.length,
  });

  return [...exact, ...rest];
}

export async function searchCachedCatalog(
  search: string
): Promise<CatalogEntry[]> {
  const needle = search.trim().toLowerCase();
  if (!needle) return [];

  const all = await prisma.catalogEntry.findMany();
  return all.filter((entry) =>
    [entry.titleRomaji, entry.titleEnglish, entry.titleNative]
      .filter(Boolean)
      .some((t) => t!.toLowerCase().includes(needle))
  );
}

/** Top do ranking de popularidade (fileira "🔥 Em alta" do Descobrir). */
export async function getTopRanked(limit = 10): Promise<CatalogEntry[]> {
  return prisma.catalogEntry.findMany({
    where: { popularityRank: { not: null } },
    orderBy: { popularityRank: "asc" },
    take: limit,
  });
}
