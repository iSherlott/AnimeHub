/**
 * Nota do site (Epic 42). Não é a nota da AniList nem da AniDB: é a nota feita pelos próprios usuários. Toda obra começa
 * em 5 (de 10) e vai sendo regulada pelas notas de quem terminou de assistir.
 *
 * Média com peso inicial: o 5 conta como `PRIOR_VOTES` notas, então uma única nota 10 não joga a obra para 10 — a nota vai
 * se aproximando da média real à medida que mais gente termina e avalia.
 */
export const SITE_SCORE_START = 5;
export const PRIOR_VOTES = 3;
export const MIN_USER_SCORE = 0;
export const MAX_USER_SCORE = 10;

export function isValidUserScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_USER_SCORE && value <= MAX_USER_SCORE;
}

/** Nota do site (uma casa decimal) e quantas notas de usuários entraram. */
export function siteScoreOf(userScores: readonly number[]): { score: number; votes: number } {
  const valid = userScores.filter(isValidUserScore);
  const total = SITE_SCORE_START * PRIOR_VOTES + valid.reduce((sum, s) => sum + s, 0);
  return { score: Math.round((total / (PRIOR_VOTES + valid.length)) * 10) / 10, votes: valid.length };
}
