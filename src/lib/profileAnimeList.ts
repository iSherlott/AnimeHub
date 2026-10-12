import { prisma } from "@/lib/prisma";
import { blockRelation } from "@/lib/blocks";

/**
 * "Animes" do perfil (estilo My Anime List): as obras que a pessoa acompanha, com busca por título e filtro
 * por gênero. A própria pessoa sempre vê a sua; os outros só veem se ela não ocultou (`animeListPublic`) e
 * não há bloqueio entre as duas. Só dados do catálogo (título, capa, gêneros, situação) — nada de
 * progresso, nota ou episódios vistos, e nenhum id interno de lista.
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
};

export type GenreFacet = { genre: string; count: number };

export type ProfileAnimeList = {
  /** Total de obras na lista (sem filtro). */
  total: number;
  entries: ProfileAnimeEntry[];
  genres: GenreFacet[];
};

export type ProfileAnimeResult = { kind: "ok"; list: ProfileAnimeList; isOwn: boolean } | { kind: "hidden" } | { kind: "unavailable" };

const MAX_ENTRIES = 500;

/** Sem acento e em minúsculas, para a busca achar "Shingeki" e "Shíngeki" do mesmo jeito. */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function filterEntries(entries: ProfileAnimeEntry[], q: string, genre: string): ProfileAnimeEntry[] {
  const needle = normalizeSearch(q);
  return entries.filter((e) => {
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
  return prisma.anime.count({ where: { userId: targetId } });
}

export async function loadProfileAnimeList(targetId: string, viewerId: string | null, q = "", genre = ""): Promise<ProfileAnimeResult> {
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { animeListPublic: true } });
  if (!target) return { kind: "unavailable" };
  const isOwn = viewerId === targetId;
  if (!isOwn && (await blockRelation(viewerId, targetId)) !== "none") return { kind: "unavailable" };
  if (!isOwn && !target.animeListPublic) return { kind: "hidden" };

  const rows = await prisma.anime.findMany({
    where: { userId: targetId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_ENTRIES,
    select: { anilistId: true, titleRomaji: true, titleEnglish: true, titleNative: true, titlePortuguese: true, coverImage: true, genres: true, status: true },
  });
  const all: ProfileAnimeEntry[] = rows.map((r) => ({ ...r, genres: r.genres ? r.genres.split(",").filter(Boolean) : [] }));
  return { kind: "ok", isOwn, list: { total: all.length, entries: filterEntries(all, q, genre), genres: genreFacets(all) } };
}
