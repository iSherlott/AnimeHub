import { normalizeTitle } from "@/lib/adminImport/matching";
import { deriveSeriesInfo } from "@/lib/series";

/**
 * Sugestões de continuação pelo NOME: obras cujo título acrescenta um número ou complementa o nome de outra
 * ("Overlord" → "Overlord IV", "Naruto" → "Naruto Shippuden", "Kaguya" → "Kaguya 3"). Só sugere; quem decide é o admin.
 */
export type SuggestWork = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  season: string | null;
  seasonYear: number | null;
  /** Franquia da produção, quando já existe (obras na mesma franquia não precisam de sugestão). */
  franchiseId: string | null;
};

export type ContinuationSuggestion = {
  earlier: SuggestWork;
  later: SuggestWork;
  /** O trecho do nome que as duas obras têm em comum. */
  shared: string;
  reason: string;
};

const SEASON_ORDER = ["WINTER", "SPRING", "SUMMER", "FALL"];
const MIN_SHARED_LENGTH = 5;

/** Posição da obra na linha do tempo (ano * 4 + estação); null quando a obra não tem temporada. */
export function seasonIndex(work: Pick<SuggestWork, "season" | "seasonYear">): number | null {
  const slot = work.season ? SEASON_ORDER.indexOf(work.season) : -1;
  if (slot < 0 || work.seasonYear === null) return null;
  return work.seasonYear * 4 + slot;
}

function namesOf(work: SuggestWork): string[] {
  return [work.titleRomaji, work.titleEnglish]
    .filter((t): t is string => Boolean(t))
    .map(normalizeTitle)
    .filter((t) => t.length > 0);
}

/** O mesmo título sem o número final ("kaguya 2" → "kaguya"); devolve null quando não termina em número. */
function withoutTrailingNumber(name: string): { base: string; n: number } | null {
  const match = /^(.*\S)\s+(\d{1,2})$/.exec(name);
  if (!match) return null;
  return { base: match[1], n: Number(match[2]) };
}

/** Por que `later` parece continuação de `earlier`, ou null quando não parece. */
export function continuationReason(earlier: SuggestWork, later: SuggestWork): { shared: string; reason: string } | null {
  const from = seasonIndex(earlier);
  const to = seasonIndex(later);
  if (from === null || to === null || to <= from) return null;
  // "2nd Season", "Season 2", "Part 2", "II"… já são ligadas pelo próprio título: não precisam de decisão.
  if (deriveSeriesInfo(earlier.titleRomaji).seriesKey === deriveSeriesInfo(later.titleRomaji).seriesKey) return null;

  let best: { shared: string; reason: string } | null = null;
  for (const a of namesOf(earlier)) {
    for (const b of namesOf(later)) {
      if (a === b) continue;
      let hit: { shared: string; reason: string } | null = null;
      if (a.length >= MIN_SHARED_LENGTH && b.startsWith(`${a} `)) {
        const extra = b.slice(a.length + 1);
        hit = { shared: a, reason: /^\d{1,2}$/.test(extra) ? `acrescenta o número ${extra} ao nome` : `complementa o nome com “${extra}”` };
      } else {
        const x = withoutTrailingNumber(a);
        const y = withoutTrailingNumber(b);
        if (x && y && x.base === y.base && y.n > x.n && x.base.length >= MIN_SHARED_LENGTH) hit = { shared: x.base, reason: `mesmo nome, do ${x.n} para o ${y.n}` };
        else if (y && y.base === a && a.length >= MIN_SHARED_LENGTH) hit = { shared: a, reason: `acrescenta o número ${y.n} ao nome` };
      }
      if (hit && (!best || hit.shared.length > best.shared.length)) best = hit;
    }
  }
  return best;
}

/**
 * Para cada obra, a anterior que mais combina (nome em comum mais longo; em empate, a mais próxima no tempo).
 * `decided` são os pares já decididos ("anterior:posterior"), confirmados ou recusados — não voltam.
 */
export function suggestContinuations(works: SuggestWork[], decided: Set<string>): ContinuationSuggestion[] {
  const byFirstWord = new Map<string, SuggestWork[]>();
  for (const w of works) {
    for (const name of namesOf(w)) {
      const key = name.split(" ")[0];
      const list = byFirstWord.get(key) ?? [];
      if (!list.includes(w)) list.push(w);
      byFirstWord.set(key, list);
    }
  }

  const out: ContinuationSuggestion[] = [];
  for (const later of works) {
    const pool = new Set<SuggestWork>();
    for (const name of namesOf(later)) for (const w of byFirstWord.get(name.split(" ")[0]) ?? []) pool.add(w);
    let pick: { earlier: SuggestWork; shared: string; reason: string } | null = null;
    for (const earlier of pool) {
      if (earlier.anilistId === later.anilistId) continue;
      if (earlier.franchiseId && earlier.franchiseId === later.franchiseId) continue;
      if (decided.has(`${earlier.anilistId}:${later.anilistId}`) || decided.has(`${later.anilistId}:${earlier.anilistId}`)) continue;
      const found = continuationReason(earlier, later);
      if (!found) continue;
      const closer = pick === null || found.shared.length > pick.shared.length || (found.shared.length === pick.shared.length && (seasonIndex(earlier) ?? 0) > (seasonIndex(pick.earlier) ?? 0));
      if (closer) pick = { earlier, ...found };
    }
    if (pick) out.push({ earlier: pick.earlier, later, shared: pick.shared, reason: pick.reason });
  }
  return out.sort((a, b) => (seasonIndex(b.later) ?? 0) - (seasonIndex(a.later) ?? 0) || a.later.titleRomaji.localeCompare(b.later.titleRomaji));
}
