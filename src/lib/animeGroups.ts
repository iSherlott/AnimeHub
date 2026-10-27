import { prisma } from "@/lib/prisma";

/**
 * Uma obra com várias temporadas conta como UM anime nas listas. Aqui se decide quais linhas da lista da pessoa são
 * temporadas da mesma obra: pela franquia da AniList (produção) e, para o que a AniList não liga, pelo título-base
 * ("2nd Season", "Season 2"… já separados em `Anime.seriesKey`).
 */
export type GroupableAnime = { anilistId: number | null; seriesKey: string | null; seasonNumber: number; titleRomaji: string };

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
  const keyOf = groupKeyOf(rows, info);
  const keys = new Map<number, string>();
  for (const row of rows) if (row.anilistId !== null) keys.set(row.anilistId, keyOf(row));
  return keys;
}

/**
 * A chave da obra de qualquer linha. Obra sem AniList ID (só do AniDB/Kitsu) não tem franquia da AniList: entra pelo
 * título-base — e, se uma temporada da mesma série tem franquia, cai junto dela.
 */
function groupKeyOf(rows: GroupableAnime[], info: Map<number, SeasonInfo>): (row: GroupableAnime) => string {
  const franchiseOf = (row: GroupableAnime) => (row.anilistId !== null ? info.get(row.anilistId)?.franchiseId : undefined);
  const franchiseBySeries = new Map<string, string>();
  for (const row of rows) {
    const franchise = franchiseOf(row);
    if (franchise && row.seriesKey) franchiseBySeries.set(row.seriesKey, franchise);
  }
  return (row) => {
    const series = row.seriesKey ?? row.titleRomaji.trim().toLowerCase();
    const franchise = franchiseOf(row) ?? franchiseBySeries.get(series);
    return franchise ? `f:${franchise}` : `s:${series}`;
  };
}

export type AnimeGroup<T> = { key: string; /** Da primeira à última temporada. */ members: T[] };

/** Agrupa as linhas por obra, mantendo a ordem em que cada obra aparece primeiro. */
export async function groupAnimes<T extends GroupableAnime>(rows: T[]): Promise<Array<AnimeGroup<T & { seasonNumber: number }>>> {
  const info = await seasonInfoFor(rows.flatMap((r) => (r.anilistId !== null ? [r.anilistId] : [])));
  const keyOf = groupKeyOf(rows, info);
  const groups = new Map<string, Array<T & { seasonNumber: number }>>();
  for (const row of rows) {
    const key = keyOf(row);
    const seasonNumber = Math.max(row.seasonNumber, (row.anilistId !== null ? info.get(row.anilistId)?.seasonNumber : undefined) ?? 1);
    groups.set(key, [...(groups.get(key) ?? []), { ...row, seasonNumber }]);
  }
  return Array.from(groups, ([key, members]) => ({ key, members: members.sort((a, b) => a.seasonNumber - b.seasonNumber) }));
}
