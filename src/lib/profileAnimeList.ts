import { prisma } from "@/lib/prisma";
import { blockRelation } from "@/lib/blocks";
import { currentSeasonRef } from "@/lib/exploreGroups";
import { countAnimeGroups, groupAnimes } from "@/lib/animeGroups";
import { deriveCategory, isWatchState, type WatchCategory, type WatchState } from "@/lib/watchCategory";

/**
 * "Animes" do perfil (estilo My Anime List): as obras que a pessoa acompanha, com busca por título e filtro
 * por gênero. A própria pessoa sempre vê a sua; os outros só veem se ela não ocultou (`animeListPublic`) e
 * não há bloqueio entre as duas. Só dados do catálogo (título, capa, gêneros, situação) — nada de
 * nota ou episódios vistos. Uma obra com várias temporadas é UM anime só (`seasonsCount`). Cada obra traz a categoria de andamento (acompanhando / não terminei / terminei / dropado);
 * o id interno e a marcação manual só vão para a própria pessoa, que é quem pode alterá-las.
 */
export type ProfileAnimeEntry = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  titlePortuguese: string | null;
  coverImage: string | null;
  genres: string[];
  status: string | null;
  category: WatchCategory;
  /** Temporadas da obra que a pessoa tem na lista (1 quando é uma só). */
  seasonsCount: number;
  /** Cada temporada com a categoria dela, da primeira à última. */
  seasons?: Array<{ anilistId: number; seasonNumber: number; category: WatchCategory }>;
  /** Só no próprio perfil: para marcar o andamento na mão (vale para a temporada mais recente). */
  animeId?: string;
  watchState?: WatchState | null;
  waiting?: boolean;
};

export type GenreFacet = { genre: string; count: number };

export type ProfileAnimeList = {
  /** Total de obras na lista (sem filtro). */
  total: number;
  /** Quantas obras casam com a busca e os filtros (a lista inteira, não só a página devolvida). */
  matched: number;
  /** Uma página das obras que casam (todas, quando a consulta não pede página). */
  entries: ProfileAnimeEntry[];
  /** Posição da próxima página; null quando acabou. */
  nextCursor: string | null;
  genres: GenreFacet[];
  /** Quantas obras há em cada categoria (da lista inteira, sem filtro). */
  categories: Record<Exclude<WatchCategory, "other">, number>;
};

export type ProfileAnimeResult = { kind: "ok"; list: ProfileAnimeList; isOwn: boolean } | { kind: "hidden" } | { kind: "unavailable" };

const MAX_ENTRIES = 500;

/** Sem acento e em minúsculas, para a busca achar "Shingeki" e "Shíngeki" do mesmo jeito. */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function filterEntries(entries: ProfileAnimeEntry[], q: string, genre: string, category = ""): ProfileAnimeEntry[] {
  const needle = normalizeSearch(q);
  return entries.filter((e) => {
    if (category && e.category !== category) return false;
    if (genre && !e.genres.includes(genre)) return false;
    if (!needle) return true;
    return normalizeSearch([e.titleRomaji, e.titleEnglish, e.titleNative, e.titlePortuguese].filter(Boolean).join(" ")).includes(needle);
  });
}

export function genreFacets(entries: ProfileAnimeEntry[]): GenreFacet[] {
  const counts = new Map<string, number>();
  for (const e of entries) for (const g of e.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
  return Array.from(counts, ([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre, "pt-BR"));
}

/** Quantas obras o perfil de `targetId` mostra para `viewerId` (null quando a lista é oculta/indisponível). */
export async function visibleAnimeCount(targetId: string, viewerId: string | null): Promise<number | null> {
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { animeListPublic: true } });
  if (!target) return null;
  if (viewerId !== targetId && !target.animeListPublic) return null;
  return countAnimeGroups(targetId);
}

/** Categoria da obra inteira: o que está acontecendo agora pesa mais que o já passado (acompanhando, não terminei, dropado, terminei). */
export function groupCategory(categories: WatchCategory[]): WatchCategory {
  for (const wanted of ["watching", "unfinished", "dropped", "finished"] as const) if (categories.includes(wanted)) return wanted;
  return "other";
}

export function categoryCounts(entries: ProfileAnimeEntry[]): ProfileAnimeList["categories"] {
  const counts = { watching: 0, unfinished: 0, finished: 0, dropped: 0 };
  for (const e of entries) if (e.category !== "other") counts[e.category] += 1;
  return counts;
}

export async function loadProfileAnimeList(targetId: string, viewerId: string | null, q = "", genre = "", category = "", page?: { offset: number; limit: number }): Promise<ProfileAnimeResult> {
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { animeListPublic: true } });
  if (!target) return { kind: "unavailable" };
  const isOwn = viewerId === targetId;
  if (!isOwn && (await blockRelation(viewerId, targetId)) !== "none") return { kind: "unavailable" };
  if (!isOwn && !target.animeListPublic) return { kind: "hidden" };

  const rows = await prisma.anime.findMany({
    where: { userId: targetId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_ENTRIES,
    select: { id: true, anilistId: true, seriesKey: true, seasonNumber: true, titleRomaji: true, titleEnglish: true, titleNative: true, titlePortuguese: true, coverImage: true, genres: true, status: true, watchState: true, waiting: true, season: true, seasonYear: true },
  });
  const pending = new Set((await prisma.pendingEpisode.findMany({ where: { userId: targetId }, select: { anilistId: true } })).map((p) => p.anilistId));
  const current = currentSeasonRef();
  const seasonRows = rows.map((r) => ({
    ...r,
    category: deriveCategory({ watchState: r.watchState, hasPending: pending.has(r.anilistId), waiting: r.waiting, status: r.status, season: r.season, seasonYear: r.seasonYear }, current),
  }));
  // Várias temporadas da mesma obra viram UM anime: o cartão é o da temporada em andamento (ou a mais recente).
  const all: ProfileAnimeEntry[] = (await groupAnimes(seasonRows)).map(({ members }) => {
    const rep = members.find((m) => m.category === "watching") ?? members[members.length - 1];
    const genreSet = new Set(members.flatMap((m) => (m.genres ? m.genres.split(",").filter(Boolean) : [])));
    return {
      anilistId: rep.anilistId,
      titleRomaji: rep.titleRomaji,
      titleEnglish: rep.titleEnglish,
      titleNative: rep.titleNative,
      titlePortuguese: rep.titlePortuguese,
      coverImage: rep.coverImage,
      genres: Array.from(genreSet),
      status: rep.status,
      category: groupCategory(members.map((m) => m.category)),
      seasonsCount: members.length,
      ...(members.length > 1 ? { seasons: members.map((m) => ({ anilistId: m.anilistId, seasonNumber: m.seasonNumber, category: m.category })) } : {}),
      ...(isOwn ? { animeId: rep.id, watchState: isWatchState(rep.watchState) ? rep.watchState : null, waiting: rep.waiting } : {}),
    };
  });
  const matched = filterEntries(all, q, genre, category);
  const entries = page ? matched.slice(page.offset, page.offset + page.limit) : matched;
  const next = page ? page.offset + entries.length : matched.length;
  return { kind: "ok", isOwn, list: { total: all.length, matched: matched.length, entries, nextCursor: next < matched.length ? String(next) : null, genres: genreFacets(all), categories: categoryCounts(all) } };
}
