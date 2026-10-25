import { timed, withAnilist } from "@/lib/episodeState";
import type { AiringScheduleEntry, CatalogEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import { annotateOwnership, discoverItemFromCatalogEntry, type DiscoverItem } from "@/lib/discoverItem";
import { hiddenAnilistIds } from "@/lib/platform";
import { startOfDayInZone } from "@/lib/timeZone";

/**
 * As fileiras do Explorar que dependem de quem olha: "Em destaque" (o que está no ar hoje) e "Novas histórias, outros
 * tempos" (sugestões pelo gosto de quem entrou; para quem não entrou, novidades e o que tem a ver com as últimas
 * páginas que visitou).
 */

export const STORIES_LIMIT = 8;
const FINISHED = "FINISHED";

export function validTimeZone(value: string | null): string | null {
  if (!value) return null;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/** Embaralha sem alterar a lista original (`rng` injetável para os testes). */
export function shuffled<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type Affinity = { anilistId: number; genres: string[] };

/** Peso de cada gênero pelo que a pessoa já tem na lista (mais obras do gênero, mais peso). */
export function genreWeights(owned: Array<{ genres: string | null }>): Map<string, number> {
  const weights = new Map<string, number>();
  for (const row of owned) for (const g of (row.genres ?? "").split(",").map((s) => s.trim()).filter(Boolean)) weights.set(g, (weights.get(g) ?? 0) + 1);
  return weights;
}

/**
 * Ordena os candidatos pela afinidade de gênero. Quem não tem nenhum gênero em comum fica de fora; entre afinidades
 * iguais, a ordem é sorteada para a fileira não ser sempre a mesma.
 */
export function rankByAffinity<T extends Affinity>(candidates: readonly T[], weights: Map<string, number>, rng: () => number = Math.random): T[] {
  const scored = candidates
    .map((c) => ({ c, score: c.genres.reduce((sum, g) => sum + (weights.get(g) ?? 0), 0) }))
    .filter((x) => x.score > 0);
  return shuffled(scored, rng)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}

/** Junta as listas na ordem dada, sem repetir obra, até `limit`. */
export function takeUnique(lists: Array<readonly DiscoverItem[]>, limit: number): DiscoverItem[] {
  const seen = new Set<string>();
  const out: DiscoverItem[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function fromAiring(entry: AiringScheduleEntry & { airingAt: Date }, catalog: CatalogEntry | undefined): DiscoverItem {
  const base: DiscoverItem = catalog
    ? discoverItemFromCatalogEntry(catalog)
    : {
        key: `anilist-${entry.anilistId}`,
        anilistId: entry.anilistId,
        kitsuId: null,
        titleRomaji: entry.titleRomaji,
        titleEnglish: entry.titleEnglish,
        titleNative: entry.titleNative,
        coverImage: entry.coverImage,
        bannerImage: entry.bannerImage,
        description: entry.description,
        episodes: null,
        genres: entry.genres ? entry.genres.split(",").filter(Boolean) : [],
        status: null,
        season: null,
        startDate: null,
        endDate: null,
        nextEpisodeNumber: null,
        nextEpisodeAt: null,
        popularityRank: null,
        cached: true,
        inMyList: false,
        animeId: null,
      };
  // O horário do cartão é o do episódio de hoje, mesmo que o catálogo já aponte para o seguinte.
  return { ...base, nextEpisodeNumber: entry.episode, nextEpisodeAt: entry.airingAt.toISOString(), airingToday: true };
}

/** As obras com episódio no dia de hoje (no fuso de quem olha), na ordem do horário. */
export async function loadAiringToday(timeZone: string, userId: string | null, now: Date = new Date()): Promise<DiscoverItem[]> {
  const from = startOfDayInZone(now, timeZone);
  const to = startOfDayInZone(new Date(from.getTime() + 36 * 3600_000), timeZone);
  const [entries, hidden] = await Promise.all([
    prisma.airingScheduleEntry.findMany({ where: { airingAt: { gte: from, lt: to }, status: "ACTIVE", anilistId: { not: null } }, orderBy: { airingAt: "asc" } }).then((rows) => withAnilist(timed(rows))),
    hiddenAnilistIds(),
  ]);
  const visible = entries.filter((e) => !hidden.has(e.anilistId));
  const catalog = await prisma.catalogEntry.findMany({ where: { anilistId: { in: visible.map((e) => e.anilistId) } } });
  const byId = new Map(catalog.map((c) => [c.anilistId as number, c]));
  const seen = new Set<number>();
  const items: DiscoverItem[] = [];
  for (const entry of visible) {
    if (seen.has(entry.anilistId)) continue;
    seen.add(entry.anilistId);
    items.push(fromAiring(entry, byId.get(entry.anilistId)));
  }
  return annotateOwnership(items, userId);
}

type StoriesInput = { userId: string | null; recentIds: number[]; limit?: number; rng?: () => number };

/** Novidades: o que o admin trouxe por último, sorteado entre as mais recentes. */
async function freshUploads(exclude: Set<number>, rng: () => number): Promise<DiscoverItem[]> {
  const rows = await prisma.catalogEntry.findMany({
    where: { onPlatform: true, anilistId: { not: null, notIn: Array.from(exclude) }, ...NOT_BLOCKED_GENRE },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });
  return shuffled(rows, rng).map(discoverItemFromCatalogEntry);
}

/** O que tem a ver com as últimas páginas visitadas: outras temporadas da mesma obra e títulos do mesmo gênero. */
async function relatedToRecent(recentIds: number[], rng: () => number): Promise<DiscoverItem[]> {
  if (recentIds.length === 0) return [];
  const exclude = new Set(recentIds);
  const [recent, productions] = await Promise.all([
    prisma.catalogEntry.findMany({ where: { anilistId: { in: recentIds } }, select: { genres: true } }),
    prisma.production.findMany({ where: { anilistId: { in: recentIds } }, select: { franchiseId: true } }),
  ]);
  const siblings = productions.length
    ? await prisma.production.findMany({ where: { franchiseId: { in: productions.map((p) => p.franchiseId) }, anilistId: { notIn: recentIds } }, select: { anilistId: true } })
    : [];
  const siblingEntries = siblings.length
    ? await prisma.catalogEntry.findMany({ where: { anilistId: { in: siblings.map((s) => s.anilistId) }, onPlatform: true, ...NOT_BLOCKED_GENRE } })
    : [];
  const weights = genreWeights(recent);
  const pool = await prisma.catalogEntry.findMany({ where: { onPlatform: true, anilistId: { not: null, notIn: Array.from(exclude) }, ...NOT_BLOCKED_GENRE }, take: 600 });
  const ranked = rankByAffinity(
    pool.map((c) => ({ c, anilistId: c.anilistId as number, genres: (c.genres ?? "").split(",").filter(Boolean) })),
    weights,
    rng
  ).map((x) => x.c);
  return [...siblingEntries, ...ranked].map(discoverItemFromCatalogEntry);
}

/**
 * "Novas histórias, outros tempos". Para quem entrou: obras terminadas dos gêneros que mais aparecem na lista da pessoa
 * (sem repetir o que ela já acompanha). Para quem não entrou (ou ainda não tem lista): novidades da plataforma sorteadas
 * e o que se liga às últimas páginas visitadas.
 */
export async function loadStories({ userId, recentIds, limit = STORIES_LIMIT, rng = Math.random }: StoriesInput): Promise<DiscoverItem[]> {
  const owned = userId ? await prisma.anime.findMany({ where: { userId }, select: { anilistId: true, genres: true } }) : [];
  const exclude = new Set<number>([...owned.map((o) => o.anilistId), ...recentIds]);
  let lists: DiscoverItem[][];

  if (owned.length > 0) {
    const weights = genreWeights(owned);
    const finished = await prisma.catalogEntry.findMany({
      where: { onPlatform: true, status: FINISHED, anilistId: { not: null, notIn: Array.from(exclude) }, ...NOT_BLOCKED_GENRE },
      take: 800,
    });
    const ranked = rankByAffinity(
      finished.map((c) => ({ c, anilistId: c.anilistId as number, genres: (c.genres ?? "").split(",").filter(Boolean) })),
      weights,
      rng
    ).map((x) => discoverItemFromCatalogEntry(x.c));
    const finishedRest = shuffled(finished, rng).map(discoverItemFromCatalogEntry);
    lists = [ranked, finishedRest, await freshUploads(exclude, rng)];
  } else {
    const [fresh, related] = await Promise.all([freshUploads(exclude, rng), relatedToRecent(recentIds, rng)]);
    // Intercala: uma novidade, uma ligada ao que a pessoa viu.
    const mixed: DiscoverItem[] = [];
    for (let i = 0; i < Math.max(fresh.length, related.length); i += 1) {
      if (related[i]) mixed.push(related[i]);
      if (fresh[i]) mixed.push(fresh[i]);
    }
    lists = [mixed];
  }
  return annotateOwnership(takeUnique(lists, limit), userId);
}
