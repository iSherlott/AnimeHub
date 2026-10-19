import { prisma } from "@/lib/prisma";
import { fuzzyDateToISO, type AniListMedia } from "@/lib/anilist";
import type { CatalogEntry } from "@prisma/client";
import { hasBlockedGenre, NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";

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
    // Sem o tipo na resposta, o que já estava guardado continua.
    ...(media.format ? { format: media.format } : {}),
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
 * Salva/atualiza no cache sempre que a AniList responde com sucesso. Isto é CACHE: a obra entra com
 * `onPlatform: false` (não aparece em lugar nenhum) e só vira parte da plataforma quando o admin a traz
 * (importação do HTML do AniDB ou painel de importação da AniList). Obra já na plataforma continua nela.
 * Conteúdo adulto (hentai) nunca é guardado.
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
  const allowed = list.filter((media) => !hasBlockedGenre(media.genres));
  for (let start = 0; start < allowed.length; start += BATCH) {
    const batch = allowed.slice(start, start + BATCH);
    // Título fixado (o do AniDB, ao religar a obra): a AniList atualiza o resto, mas não o nome.
    const locked = new Set((await prisma.catalogEntry.findMany({ where: { anilistId: { in: batch.map((m) => m.id) }, titleLocked: true }, select: { anilistId: true } })).map((r) => r.anilistId));
    await Promise.all(
      batch.map((media, offset) => {
        const data = anilistToCatalogData(media, rankFromOrder ? start + offset + 1 : null);
        const { titleRomaji: _keep, ...withoutTitle } = data;
        void _keep;
        return prisma.catalogEntry.upsert({ where: { anilistId: media.id }, create: { ...data, onPlatform: false }, update: locked.has(media.id) ? withoutTitle : data });
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
 * Obras da plataforma na temporada pedida — só elas, sem completar com outras temporadas: o que não foi trazido
 * pelo admin (upload do AniDB ou painel da AniList) não aparece.
 */
export async function getCachedSeason(
  season: string,
  seasonYear: number
): Promise<CatalogEntry[]> {
  return dedupeByTitle(
    await prisma.catalogEntry.findMany({
      where: { season, seasonYear, onPlatform: true, ...NOT_BLOCKED_GENRE },
      orderBy: { titleRomaji: "asc" },
    })
  );
}

export async function searchCachedCatalog(
  search: string
): Promise<CatalogEntry[]> {
  const needle = search.trim().toLowerCase();
  if (!needle) return [];

  const all = await prisma.catalogEntry.findMany({ where: { onPlatform: true, ...NOT_BLOCKED_GENRE } });
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
    where: { popularityRank: { not: null }, onPlatform: true, ...NOT_BLOCKED_GENRE },
    orderBy: { popularityRank: "asc" },
  });
  return dedupeByTitle(ranked).slice(0, limit);
}
