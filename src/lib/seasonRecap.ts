import { prisma } from "@/lib/prisma";
import { blockedUserIdSet } from "@/lib/blocks";
import { workHref } from "@/lib/workHref";
import { currentSeasonRef, type SeasonRef } from "@/lib/exploreGroups";
import { deriveCategory, type WatchCategory } from "@/lib/watchCategory";

/**
 * Retrospectiva da temporada (10/11/2026): só obras e gêneros — sem "horas assistidas", porque o progresso por
 * episódio foi arquivado (26/10) e o site não inventa números. Quantas obras da temporada a pessoa acompanhou, em que
 * pé está cada uma, os gêneros que mais apareceram, as que ela deu nota mais alta e o que os amigos mais viram.
 */

export type RecapWork = { key: string; href: string | null; titleRomaji: string; titleEnglish: string | null; coverImage: string | null; userScore: number | null; category: WatchCategory };
export type RecapGenre = { genre: string; count: number };
export type RecapFriendWork = { key: string; href: string | null; titleRomaji: string; titleEnglish: string | null; coverImage: string | null; friends: number; mine: boolean };
export type SeasonRecap = {
  season: SeasonRef;
  total: number;
  byCategory: Record<Exclude<WatchCategory, "other">, number>;
  topGenres: RecapGenre[];
  /** Gênero que domina: aparece em mais da metade das obras (null quando não há um claro). */
  signatureGenre: string | null;
  bestRated: RecapWork[];
  works: RecapWork[];
  friendsTop: RecapFriendWork[];
};

type RecapRow = {
  key: string;
  href: string | null;
  titleRomaji: string;
  titleEnglish: string | null;
  coverImage: string | null;
  genres: string[];
  userScore: number | null;
  category: WatchCategory;
};

/** A parte pura: soma, ordena e corta. */
export function buildSeasonRecap(season: SeasonRef, rows: RecapRow[], friendsTop: RecapFriendWork[] = []): SeasonRecap {
  const byCategory = { watching: 0, unfinished: 0, finished: 0, dropped: 0 };
  const genreCount = new Map<string, number>();
  for (const row of rows) {
    if (row.category !== "other") byCategory[row.category] += 1;
    for (const genre of new Set(row.genres)) genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
  }
  const topGenres = [...genreCount]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre, "pt-BR"))
    .slice(0, 6);
  const signatureGenre = rows.length >= 3 && topGenres[0] && topGenres[0].count * 2 > rows.length ? topGenres[0].genre : null;
  const works: RecapWork[] = rows.map((r) => ({ key: r.key, href: r.href, titleRomaji: r.titleRomaji, titleEnglish: r.titleEnglish, coverImage: r.coverImage, userScore: r.userScore, category: r.category }));
  const bestRated = works
    .filter((w) => w.userScore !== null)
    .sort((a, b) => (b.userScore ?? 0) - (a.userScore ?? 0) || a.titleRomaji.localeCompare(b.titleRomaji, "pt-BR"))
    .slice(0, 3);
  return { season, total: rows.length, byCategory, topGenres, signatureGenre, bestRated, works, friendsTop };
}

const splitGenres = (value: string | null) => (value ? value.split(",").map((g) => g.trim()).filter(Boolean) : []);
const workKey = (r: { anilistId: number | null; id: string }) => (r.anilistId !== null ? String(r.anilistId) : r.id);

export async function loadSeasonRecap(userId: string, season: SeasonRef): Promise<SeasonRecap> {
  const [rows, pendingRows, links, blocked] = await Promise.all([
    prisma.anime.findMany({
      where: { userId, season: season.season, seasonYear: season.year },
      orderBy: [{ titleRomaji: "asc" }],
      select: { id: true, anilistId: true, anidbId: true, kitsuId: true, catalogEntryId: true, titleRomaji: true, titleEnglish: true, coverImage: true, genres: true, userScore: true, watchState: true, waiting: true, status: true, season: true, seasonYear: true },
    }),
    prisma.pendingEpisode.findMany({ where: { userId }, select: { anilistId: true } }),
    prisma.friendship.findMany({ where: { OR: [{ userAId: userId }, { userBId: userId }] }, select: { userAId: true, userBId: true } }),
    blockedUserIdSet(userId),
  ]);
  const pending = new Set(pendingRows.map((p) => p.anilistId));
  const current = currentSeasonRef();
  const mine: RecapRow[] = rows.map((r) => ({
    key: workKey(r),
    href: workHref(r),
    titleRomaji: r.titleRomaji,
    titleEnglish: r.titleEnglish,
    coverImage: r.coverImage,
    genres: splitGenres(r.genres),
    userScore: r.userScore,
    category: deriveCategory({ watchState: r.watchState, hasPending: r.anilistId !== null && pending.has(r.anilistId), waiting: r.waiting, status: r.status, season: r.season, seasonYear: r.seasonYear }, current),
  }));

  // Amigos: só listas visíveis, sem o que dropou e sem quem tem bloqueio com a pessoa.
  const friendIds = links.map((l) => (l.userAId === userId ? l.userBId : l.userAId)).filter((id) => !blocked.has(id));
  const friendRows = friendIds.length
    ? await prisma.anime.findMany({
        where: { userId: { in: friendIds }, user: { animeListPublic: true }, season: season.season, seasonYear: season.year, OR: [{ watchState: null }, { watchState: { not: "DROPPED" } }] },
        select: { id: true, anilistId: true, anidbId: true, kitsuId: true, catalogEntryId: true, titleRomaji: true, titleEnglish: true, coverImage: true, userId: true },
      })
    : [];
  const mineKeys = new Set(mine.map((m) => m.key));
  const byWork = new Map<string, { row: (typeof friendRows)[number]; people: Set<string> }>();
  for (const row of friendRows) {
    const key = workKey(row);
    const entry = byWork.get(key) ?? { row, people: new Set<string>() };
    entry.people.add(row.userId as string);
    byWork.set(key, entry);
  }
  const friendsTop: RecapFriendWork[] = [...byWork]
    .map(([key, { row, people }]) => ({ key, href: workHref(row), titleRomaji: row.titleRomaji, titleEnglish: row.titleEnglish, coverImage: row.coverImage, friends: people.size, mine: mineKeys.has(key) }))
    .sort((a, b) => b.friends - a.friends || a.titleRomaji.localeCompare(b.titleRomaji, "pt-BR"))
    .slice(0, 5);

  return buildSeasonRecap(season, mine, friendsTop);
}
