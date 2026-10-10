import { parseSeasonSlug } from "@/lib/exploreGroups";

/**
 * Matching entre um registro importado e as produções do catálogo (Figma
 * "Matching", `8:4179`). O score vem de pesos sobre critérios NORMALIZADOS —
 * não é média simples e nunca substitui a revisão humana: só acima de
 * `AUTO_THRESHOLD`, sem empate com outro candidato, o registro é aceito sozinho.
 */
export const AUTO_THRESHOLD = 0.92;
export const REVIEW_THRESHOLD = 0.55;
/** Diferença mínima entre o 1º e o 2º candidato para o match automático. */
export const AMBIGUITY_GAP = 0.04;

const WEIGHTS = { title: 0.7, season: 0.15, year: 0.15 } as const;

const normalized = new Map<string, string>();

/** NFKC + minúsculas + sem acentos/pontuação + espaços colapsados (kanji/kana preservados). Memoizado: o pool tem milhares de títulos. */
export function normalizeTitle(text: string): string {
  const hit = normalized.get(text);
  if (hit !== undefined) return hit;
  const result = normalizeTitleUncached(text);
  if (normalized.size > 50_000) normalized.clear();
  normalized.set(text, result);
  return result;
}

function normalizeTitleUncached(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    // Só os acentos latinos (U+0300–036F): o dakuten do kana (U+3099) muda o caractere (ほ ≠ ぼ).
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Coeficiente de Dice sobre bigramas (0..1). */
export function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i += 1) {
      const g = s.slice(i, i + 2);
      map.set(g, (map.get(g) ?? 0) + 1);
    }
    return map;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

export type MatchCandidate = {
  id: string;
  anilistId: number;
  titles: string[];
  season: string | null;
  seasonYear: number | null;
  anidbId: number | null;
};

export type MatchInput = {
  sourceKey: string;
  titles: string[];
  /** "Autumn2026" (rótulo da temporada do lote). */
  seasonLabel: string | null;
  year: number | null;
};

/** Cada critério vai de 0 a 1; `null` = sem dado (não entra na média ponderada). */
export type ScoreDetail = { title: number; season: number | null; year: number | null; image: number | null };

export type ScoredCandidate = { candidate: MatchCandidate; score: number; detail: ScoreDetail };

export function scoreCandidate(input: MatchInput, candidate: MatchCandidate): ScoredCandidate {
  if (candidate.anidbId !== null && String(candidate.anidbId) === input.sourceKey) {
    // Vínculo já confirmado antes: a identidade manda.
    return { candidate, score: 1, detail: { title: 1, season: null, year: null, image: null } };
  }
  const left = input.titles.map(normalizeTitle).filter(Boolean);
  const right = candidate.titles.map(normalizeTitle).filter(Boolean);
  let title = 0;
  for (const l of left) for (const r of right) title = Math.max(title, dice(l, r));

  const ref = input.seasonLabel ? parseSeasonSlug(input.seasonLabel) : null;
  const season = ref && candidate.season ? (ref.season === candidate.season ? 1 : 0) : null;
  const targetYear = input.year ?? ref?.year ?? null;
  const year =
    targetYear !== null && candidate.seasonYear !== null ? (targetYear === candidate.seasonYear ? 1 : Math.abs(targetYear - candidate.seasonYear) === 1 ? 0.5 : 0) : null;

  let total = WEIGHTS.title * title;
  let weight = WEIGHTS.title;
  if (season !== null) {
    total += WEIGHTS.season * season;
    weight += WEIGHTS.season;
  }
  if (year !== null) {
    total += WEIGHTS.year * year;
    weight += WEIGHTS.year;
  }
  return { candidate, score: total / weight, detail: { title, season, year, image: null } };
}

export function rankCandidates(input: MatchInput, candidates: MatchCandidate[], top = 3): ScoredCandidate[] {
  return candidates
    .map((c) => scoreCandidate(input, c))
    .filter((s) => s.score >= REVIEW_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}

export type MatchOutcome =
  | { state: "AUTO"; best: ScoredCandidate }
  /** Há candidato plausível, mas um humano precisa confirmar. */
  | { state: "PENDING"; best: ScoredCandidate }
  /** Nenhum candidato razoável: vira uma produção nova. */
  | { state: "NEW"; best: null };

export function classifyMatch(ranked: ScoredCandidate[]): MatchOutcome {
  const best = ranked[0];
  if (!best || best.score < REVIEW_THRESHOLD) return { state: "NEW", best: null };
  const second = ranked[1];
  const ambiguous = second !== undefined && best.score - second.score < AMBIGUITY_GAP;
  if (best.score >= AUTO_THRESHOLD && !ambiguous) return { state: "AUTO", best };
  return { state: "PENDING", best };
}
