import { prisma } from "@/lib/prisma";
import { NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import { blockedUserIdSet } from "@/lib/blocks";
import type { AniListRecommendation } from "@/lib/anilist";
import type { RecommendationData } from "@/components/RecommendationCard";

/**
 * Recomendações de animes: SÓ obras que fazem parte da plataforma (as que o admin trouxe), então todo cartão leva a
 * uma página da obra que já tem dados. Vale para a lateral do Feed e para a página de cada anime.
 * Três fontes, nesta ordem:
 *  0. o que os amigos acompanham (10/11/2026; só de quem deixa a lista visível e não dropou), até metade das vagas;
 *  1. recomendações da AniList (Epic 14, `Anime.recommendationsJson`) que apontam para uma obra carregada;
 *  2. afinidade de gêneros entre a lista da pessoa e o catálogo carregado, para quando as da AniList não bastam.
 * Nunca recomenda o que a pessoa já acompanha. Uma carga nova muda o resultado na hora (nada fica em cache).
 */
export type RecommendationItem = RecommendationData & {
  /** "Porque você acompanha X" (recomendação da AniList). */
  becauseTitle: string | null;
  /** Gêneros em comum com o que a pessoa acompanha (afinidade). */
  sharedGenres: string[];
  /** Amigos que acompanham a obra (nomes de exibição, quem deu a melhor nota primeiro). */
  friendNames: string[];
};

/** Obra que amigos acompanham: quem são, e a melhor nota que um deles deu (desempata). */
export type FriendPick = { anilistId: number; friendNames: string[]; bestScore: number | null };

export type FollowedForRecs = { anilistId: number; titleRomaji: string; genres: string[]; recommendations: AniListRecommendation[] };
export type LoadedTitle = { anilistId: number; titleRomaji: string; titleEnglish: string | null; coverImage: string | null; genres: string[]; popularityRank: number | null };

const toItem = (title: LoadedTitle, extra: { becauseTitle: string | null; sharedGenres: string[]; friendNames?: string[] }): RecommendationItem => ({
  anilistId: title.anilistId,
  titleRomaji: title.titleRomaji,
  titleEnglish: title.titleEnglish,
  coverImage: title.coverImage,
  href: `/anime/${title.anilistId}`,
  isInternal: true,
  friendNames: [],
  ...extra,
});

export function rankRecommendations(followed: FollowedForRecs[], loaded: LoadedTitle[], limit: number, friendPicks: FriendPick[] = []): RecommendationItem[] {
  const owned = new Set(followed.map((f) => f.anilistId));
  const loadedById = new Map(loaded.map((l) => [l.anilistId, l]));
  const seen = new Set<number>();
  const results: RecommendationItem[] = [];

  // Amigos primeiro, mas sem tomar todas as vagas: mais amigos na mesma obra, depois a melhor nota.
  const friendSlots = Math.ceil(limit / 2);
  const picks = [...friendPicks].sort((a, b) => b.friendNames.length - a.friendNames.length || (b.bestScore ?? 0) - (a.bestScore ?? 0) || a.anilistId - b.anilistId);
  for (const pick of picks) {
    const title = loadedById.get(pick.anilistId);
    if (!title || owned.has(pick.anilistId) || seen.has(pick.anilistId)) continue;
    seen.add(pick.anilistId);
    results.push(toItem(title, { becauseTitle: null, sharedGenres: [], friendNames: pick.friendNames }));
    if (results.length >= friendSlots) break;
  }

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

/**
 * O que os amigos acompanham: só de quem deixa a lista visível, sem as obras dropadas e sem quem tem bloqueio com a
 * pessoa. Para cada obra, os amigos (o que deu a melhor nota primeiro).
 */
export async function friendPicksFor(userId: string): Promise<FriendPick[]> {
  const [links, blocked] = await Promise.all([
    prisma.friendship.findMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] }, select: { userAId: true, userBId: true } }),
    blockedUserIdSet(userId),
  ]);
  const friendIds = links.map((l) => (l.userAId === userId ? l.userBId : l.userAId)).filter((id) => !blocked.has(id));
  if (friendIds.length === 0) return [];
  const rows = await prisma.anime.findMany({
    where: { userId: { in: friendIds }, anilistId: { not: null }, user: { animeListPublic: true }, OR: [{ watchState: null }, { watchState: { not: "DROPPED" } }] },
    select: { anilistId: true, userScore: true, user: { select: { displayName: true } } },
  });
  const byWork = new Map<number, { name: string; score: number | null }[]>();
  for (const row of rows) {
    const id = row.anilistId as number;
    byWork.set(id, [...(byWork.get(id) ?? []), { name: row.user?.displayName ?? "", score: row.userScore }]);
  }
  return [...byWork].map(([anilistId, people]) => {
    const sorted = people.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
    return { anilistId, friendNames: sorted.map((p) => p.name), bestScore: sorted[0]?.score ?? null };
  });
}

export async function getAggregatedRecommendations(userId: string, limit: number): Promise<RecommendationItem[]> {
  const [animes, loaded, friendPicks] = await Promise.all([
    prisma.anime.findMany({ where: { userId }, select: { anilistId: true, titleRomaji: true, genres: true, recommendationsJson: true } }),
    loadedTitles(),
    friendPicksFor(userId),
  ]);
  // Recomendações vêm da AniList: obra sem AniList ID (só do AniDB/Kitsu) não tem de onde puxar.
  const followed: FollowedForRecs[] = animes.flatMap((a) => (a.anilistId === null ? [] : [{ anilistId: a.anilistId, titleRomaji: a.titleRomaji, genres: splitGenres(a.genres), recommendations: parseRecommendations(a.recommendationsJson) }]));
  return rankRecommendations(followed, loaded, limit, friendPicks);
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
