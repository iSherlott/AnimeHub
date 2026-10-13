import { prisma } from "@/lib/prisma";

/**
 * Uma obra com várias temporadas conta como UM anime nas listas. Aqui se decide quais linhas da lista da pessoa são
 * temporadas da mesma obra: pela franquia da AniList (produção) e, para o que a AniList não liga, pelo título-base
 * ("2nd Season", "Season 2"… já separados em `Anime.seriesKey`).
 */
export type GroupableAnime = { anilistId: number; seriesKey: string | null; seasonNumber: number; titleRomaji: string };

/** Número da temporada: o da lista e, se a franquia da AniList sabe um maior, esse. */
export type SeasonInfo = { franchiseId: string | null; seasonNumber: number };

export async function seasonInfoFor(anilistIds: number[]): Promise<Map<number, SeasonInfo>> {
  if (anilistIds.length === 0) return new Map();
  const productions = await prisma.production.findMany({ where: { anilistId: { in: anilistIds } }, select: { anilistId: true, franchiseId: true, seasonNumber: true } });
  return new Map(productions.map((p) => [p.anilistId, { franchiseId: p.franchiseId, seasonNumber: p.seasonNumber }]));
}

/**
 * Chave da obra (todas as temporadas juntas) de cada linha: `f:<franquia>` quando a AniList liga as temporadas e
 * `s:<título-base>` quando só o título liga. Se uma temporada tem franquia e outra só título, as duas caem na mesma obra.
 */
export function groupKeysFor(rows: GroupableAnime[], info: Map<number, SeasonInfo>): Map<number, string> {
  const franchiseBySeries = new Map<string, string>();
  for (const row of rows) {
    const franchise = info.get(row.anilistId)?.franchiseId;
    if (franchise && row.seriesKey) franchiseBySeries.set(row.seriesKey, franchise);
  }
  const keys = new Map<number, string>();
  for (const row of rows) {
    const series = row.seriesKey ?? row.titleRomaji.trim().toLowerCase();
    const franchise = info.get(row.anilistId)?.franchiseId ?? franchiseBySeries.get(series);
    keys.set(row.anilistId, franchise ? `f:${franchise}` : `s:${series}`);
  }
  return keys;
}

export type AnimeGroup<T> = { key: string; /** Da primeira à última temporada. */ members: T[] };

/** Agrupa as linhas por obra, mantendo a ordem em que cada obra aparece primeiro. */
export async function groupAnimes<T extends GroupableAnime>(rows: T[]): Promise<Array<AnimeGroup<T & { seasonNumber: number }>>> {
  const info = await seasonInfoFor(rows.map((r) => r.anilistId));
  const keys = groupKeysFor(rows, info);
  const groups = new Map<string, Array<T & { seasonNumber: number }>>();
  for (const row of rows) {
    const key = keys.get(row.anilistId) as string;
    const seasonNumber = Math.max(row.seasonNumber, info.get(row.anilistId)?.seasonNumber ?? 1);
    groups.set(key, [...(groups.get(key) ?? []), { ...row, seasonNumber }]);
  }
  return Array.from(groups, ([key, members]) => ({ key, members: members.sort((a, b) => a.seasonNumber - b.seasonNumber) }));
}

/** Quantas obras (não temporadas) a pessoa tem na lista. */
export async function countAnimeGroups(userId: string): Promise<number> {
  const rows = await prisma.anime.findMany({ where: { userId }, select: { anilistId: true, seriesKey: true, seasonNumber: true, titleRomaji: true } });
  return (await groupAnimes(rows)).length;
}
