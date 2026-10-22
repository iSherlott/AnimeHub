import { sortKey } from "@/lib/curation/franchiseOrder";
import type { TimelineEntry } from "@/lib/curation/timeline";

/**
 * Linha do tempo da obra (Epic 46): as temporadas da linha principal em abas e, em cada uma, os episódios em ordem com uma
 * ramificação para o que é complementar (OVA, ODA, filmes) no ponto em que foi ao ar. Funções puras para montar essa ordem.
 */
export type Branch = {
  anilistId: number;
  kind: string | null;
  titleRomaji: string;
  titleNative: string | null;
  /** Estreia em milissegundos (data, ou o início da temporada quando só ela é conhecida); nulo = sem data. */
  whenMs: number | null;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  relationType: string | null;
  current: boolean;
};

export function branchesOf(specials: ReadonlyArray<TimelineEntry>): Branch[] {
  return specials.map((s) => ({
    anilistId: s.anilistId,
    kind: s.kind,
    titleRomaji: s.titleRomaji,
    titleNative: s.titleNative,
    whenMs: sortKey({ startDate: s.startDate ? Date.parse(s.startDate) || null : null, season: s.season, seasonYear: s.seasonYear }),
    season: s.season,
    seasonYear: s.seasonYear,
    episodes: s.episodes,
    relationType: s.relationType ?? null,
    current: s.current,
  }));
}

const byWhen = (a: Branch, b: Branch) => (a.whenMs ?? Number.POSITIVE_INFINITY) - (b.whenMs ?? Number.POSITIVE_INFINITY) || a.anilistId - b.anilistId;

/**
 * Em qual temporada cada especial se ramifica: a última que já tinha começado quando ele foi ao ar (o que saiu antes de todas
 * fica na primeira; o que não tem data, na última). Cada lista sai em ordem de estreia.
 */
export function assignBranches(seasons: ReadonlyArray<{ anilistId: number; season: string | null; seasonYear: number | null }>, branches: ReadonlyArray<Branch>): Record<number, Branch[]> {
  const starts = seasons.map((s) => ({ id: s.anilistId, at: sortKey({ startDate: null, season: s.season, seasonYear: s.seasonYear }) }));
  const result: Record<number, Branch[]> = Object.fromEntries(seasons.map((s) => [s.anilistId, []]));
  if (seasons.length === 0) return result;
  for (const branch of [...branches].sort(byWhen)) {
    let target = branch.whenMs === null ? starts[starts.length - 1].id : starts[0].id;
    if (branch.whenMs !== null) {
      for (const start of starts) if (start.at !== null && start.at <= branch.whenMs) target = start.id;
    }
    result[target].push(branch);
  }
  return result;
}

export type JourneyItem<E> = { type: "episode"; episode: E } | { type: "branch"; branch: Branch };

/** Episódios em ordem com cada ramificação antes do primeiro episódio que foi ao ar depois dela (sem episódio depois: no fim). */
export function interleave<E extends { dateMs: number | null }>(episodes: ReadonlyArray<E>, branches: ReadonlyArray<Branch>): Array<JourneyItem<E>> {
  const items: Array<JourneyItem<E>> = [];
  const pending = [...branches].sort(byWhen);
  let next = 0;
  for (const episode of episodes) {
    while (next < pending.length) {
      const when = pending[next].whenMs;
      if (when === null || episode.dateMs === null || when > episode.dateMs) break;
      items.push({ type: "branch", branch: pending[next] });
      next += 1;
    }
    items.push({ type: "episode", episode });
  }
  for (; next < pending.length; next += 1) items.push({ type: "branch", branch: pending[next] });
  return items;
}
