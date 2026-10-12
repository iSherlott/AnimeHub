import { prisma } from "@/lib/prisma";
import { NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import type { AniListRecommendation } from "@/lib/anilist";
import type { RecommendationData } from "@/components/RecommendationCard";

/**
 * Recomendações de animes: SÓ obras que fazem parte da plataforma (as que o admin trouxe), então todo cartão leva a
 * uma página da obra que já tem dados. Vale para a lateral do Feed e para a página de cada anime.
 * Duas fontes, nesta ordem:
 *  1. recomendações da AniList (Epic 14, `Anime.recommendationsJson`) que apontam para uma obra carregada;
 *  2. afinidade de gêneros entre a lista da pessoa e o catálogo carregado, para quando as da AniList não bastam.
 * Nunca recomenda o que a pessoa já acompanha. Uma carga nova muda o resultado na hora (nada fica em cache).
 */
export type RecommendationItem = RecommendationData & {
  /** "Porque você acompanha X" (recomendação da AniList). */
  becauseTitle: string | null;
  /** Gêneros em comum com o que a pessoa acompanha (afinidade). */
  sharedGenres: string[];
};

export type FollowedForRecs = { anilistId: number; titleRomaji: string; genres: string[]; recommendations: AniListRecommendation[] };
export type LoadedTitle = { anilistId: number; titleRomaji: string; titleEnglish: string | null; coverImage: string | null; genres: string[]; popularityRank: number | null };

const toItem = (title: LoadedTitle, extra: { becauseTitle: string | null; sharedGenres: string[] }): RecommendationItem => ({
  anilistId: title.anilistId,
  titleRomaji: title.titleRomaji,
  titleEnglish: title.titleEnglish,
  coverImage: title.coverImage,
  href: `/obra/${title.anilistId}`,
  isInternal: true,
  ...extra,
});

export function rankRecommendations(followed: FollowedForRecs[], loaded: LoadedTitle[], limit: number): RecommendationItem[] {
  const owned = new Set(followed.map((f) => f.anilistId));
  const loadedById = new Map(loaded.map((l) => [l.anilistId, l]));
  const seen = new Set<number>();
  const results: RecommendationItem[] = [];

  for (const anime of followed) {
    for (const rec of anime.recommendations) {
      const title = loadedById.get(rec.anilistId);
      if (!title || owned.has(rec.anilistId) || seen.has(rec.anilistId)) continue;
      seen.add(rec.anilistId);
      results.push(toItem(title, { becauseTitle: anime.titleRomaji, sharedGenres: [] }));
      if (results.length >= limit) return results;
    }
  }

  const weights = new Map<string, number>();
  for (const anime of followed) for (const genre of anime.genres) weights.set(genre, (weights.get(genre) ?? 0) + 1);
  const scored = loaded
    .filter((l) => !owned.has(l.anilistId) && !seen.has(l.anilistId))
    .map((l) => {
      const shared = l.genres.filter((g) => weights.has(g));
      return { title: l, shared, score: shared.reduce((sum, g) => sum + (weights.get(g) ?? 0), 0) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (a.title.popularityRank ?? Infinity) - (b.title.popularityRank ?? Infinity) || a.title.anilistId - b.title.anilistId);
  for (const { title, shared } of scored) {
    results.push(toItem(title, { becauseTitle: null, sharedGenres: shared }));
    if (results.length >= limit) break;
  }
  return results;
}

function parseRecommendations(json: string | null): AniListRecommendation[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const splitGenres = (value: string | null) => (value ? value.split(",").filter(Boolean) : []);

/** Obras do catálogo que estão na plataforma. */
export async function loadedTitles(): Promise<LoadedTitle[]> {
  const rows = await prisma.catalogEntry.findMany({
    where: { anilistId: { not: null }, onPlatform: true, ...NOT_BLOCKED_GENRE },
    select: { anilistId: true, titleRomaji: true, titleEnglish: true, coverImage: true, genres: true, popularityRank: true },
  });
  return rows.map((r) => ({ anilistId: r.anilistId as number, titleRomaji: r.titleRomaji, titleEnglish: r.titleEnglish, coverImage: r.coverImage, genres: splitGenres(r.genres), popularityRank: r.popularityRank }));
}

export async function getAggregatedRecommendations(userId: string, limit: number): Promise<RecommendationItem[]> {
  const [animes, loaded] = await Promise.all([
    prisma.anime.findMany({ where: { userId }, select: { anilistId: true, titleRomaji: true, genres: true, recommendationsJson: true } }),
    loadedTitles(),
  ]);
  const followed: FollowedForRecs[] = animes.map((a) => ({ anilistId: a.anilistId, titleRomaji: a.titleRomaji, genres: splitGenres(a.genres), recommendations: parseRecommendations(a.recommendationsJson) }));
  return rankRecommendations(followed, loaded, limit);
}

/**
 * Quantas recomendações únicas da AniList (de todos os animes acompanhados) apontam para obras carregadas.
 * É o número que a fase "Recomendações" da carga mostra para o admin conferir.
 */
export async function countLinkedRecommendations(): Promise<{ linked: number; total: number }> {
  const [rows, loaded] = await Promise.all([prisma.anime.findMany({ select: { recommendationsJson: true } }), loadedTitles()]);
  const loadedIds = new Set(loaded.map((l) => l.anilistId));
  const unique = new Set<number>();
  for (const row of rows) for (const rec of parseRecommendations(row.recommendationsJson)) unique.add(rec.anilistId);
  let linked = 0;
  for (const id of unique) if (loadedIds.has(id)) linked += 1;
  return { linked, total: unique.size };
}
