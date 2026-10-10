import { prisma } from "@/lib/prisma";
import { fuzzyDateToISO, type AniListMedia } from "@/lib/anilist";
import type { CatalogEntry } from "@prisma/client";

function anilistToCatalogData(media: AniListMedia, popularityRank: number | null) {
  const startDateISO = fuzzyDateToISO(media.startDate);
  const endDateISO = fuzzyDateToISO(media.endDate);

  return {
    anilistId: media.id,
    malId: media.idMal ?? null,
    titleRomaji: media.title.romaji,
    titleEnglish: media.title.english,
    titleNative: media.title.native,
    coverImage: media.coverImage.extraLarge,
    bannerImage: media.bannerImage,
    description: media.description,
    episodes: media.episodes,
    status: media.status,
    season: media.season,
    seasonYear: media.seasonYear,
    genres: media.genres.join(","),
    averageScore: media.averageScore,
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
  // Em lotes de 10: uma temporada inteira (~300 obras) não pode virar 300 idas e voltas em fila.
  const BATCH = 10;
  for (let start = 0; start < list.length; start += BATCH) {
    await Promise.all(
      list.slice(start, start + BATCH).map((media, offset) => {
        const data = anilistToCatalogData(media, rankFromOrder ? start + offset + 1 : null);
        return prisma.catalogEntry.upsert({ where: { anilistId: media.id }, create: data, update: data });
      })
    );
  }
}

/**
 * AniList e Kitsu alimentam o cache em linhas separadas para o mesmo anime
 * (uma via `anilistId`, outra via `kitsuId`, sem ligação entre elas), então
 * a mesma obra pode aparecer duas vezes numa listagem. Mantém só uma linha
 * por título normalizado, priorizando a que já tem `anilistId` (fonte mais
 * completa).
 */
function dedupeByTitle(entries: CatalogEntry[]): CatalogEntry[] {
  const byTitle = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    const key = entry.titleRomaji.trim().toLowerCase();
    const existing = byTitle.get(key);
    if (!existing || (existing.anilistId == null && entry.anilistId != null)) {
      byTitle.set(key, entry);
    }
  }
  return [...byTitle.values()];
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

  const exact = dedupeByTitle(
    await prisma.catalogEntry.findMany({
      where: { season, seasonYear },
      orderBy: { titleRomaji: "asc" },
    })
  );
  if (exact.length >= TOTAL) return exact;

  const exactTitles = new Set(exact.map((e) => e.titleRomaji.trim().toLowerCase()));
  const remaining = TOTAL - exact.length;
  const rest = await prisma.catalogEntry.findMany({
    where: { NOT: { id: { in: exact.map((e) => e.id) } } },
    orderBy: { updatedAt: "desc" },
    // margem: parte do que vier pode ser duplicata (de si mesmo ou de um
    // título já coberto por `exact`) e ser descartada pelo filtro abaixo.
    take: remaining * 2,
  });
  const filler = dedupeByTitle(rest).filter(
    (e) => !exactTitles.has(e.titleRomaji.trim().toLowerCase())
  );

  return [...exact, ...filler.slice(0, remaining)];
}

export async function searchCachedCatalog(
  search: string
): Promise<CatalogEntry[]> {
  const needle = search.trim().toLowerCase();
  if (!needle) return [];

  const all = await prisma.catalogEntry.findMany();
  const matches = all.filter((entry) =>
    [entry.titleRomaji, entry.titleEnglish, entry.titleNative]
      .filter(Boolean)
      .some((t) => t!.toLowerCase().includes(needle))
  );
  return dedupeByTitle(matches);
}

/** Top do ranking de popularidade (fileira "🔥 Em alta" do Descobrir). */
export async function getTopRanked(limit = 10): Promise<CatalogEntry[]> {
  // Busca tudo que tem rank (é um conjunto pequeno por natureza — só o topo
  // de popularidade) em vez de arriscar um "take" curto demais que
  // sub-preenche a fileira se metade colidir na deduplicação.
  const ranked = await prisma.catalogEntry.findMany({
    where: { popularityRank: { not: null } },
    orderBy: { popularityRank: "asc" },
  });
  return dedupeByTitle(ranked).slice(0, limit);
}
