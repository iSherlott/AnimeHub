/**
 * Ranking da aba "Recomendado" do feed (Epic 22) — heurística simples de
 * recência+engajamento, não aprendizado de máquina (decisão explícita do
 * usuário). Estilo "gravidade" do Hacker News: pontuação cai com a idade,
 * é elevada por curtidas.
 */
export const RANKED_WINDOW_SIZE = 300;

const GRAVITY = 1.5;
const AGE_OFFSET_HOURS = 2;

/**
 * +1 no numerador evita score=0 pra posts sem curtida nenhuma (eles ainda
 * competem por recência); +2 horas no denominador evita o score explodir
 * pra posts com poucos segundos de idade.
 */
export function computeRecommendedScore(
  likeCount: number,
  createdAt: Date,
  now: Date = new Date()
): number {
  const ageInHours = Math.max(0, (now.getTime() - createdAt.getTime()) / 3_600_000);
  return (likeCount + 1) / Math.pow(ageInHours + AGE_OFFSET_HOURS, GRAVITY);
}
