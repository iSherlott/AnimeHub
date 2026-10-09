/**
 * Regras puras do calendar-loader (testáveis sem rede/banco).
 *
 * Contexto do bug que isto corrige: o loader pedia UMA janela de ~17 semanas
 * à AniList, ordenada do mais antigo ao mais novo, com teto de 10 páginas
 * (~500 itens). A janela passada consumia o teto e a semana atual nunca era
 * ingerida — e o /health era estático, então nada alertava.
 */

export const WEEK_SECONDS = 7 * 24 * 3600;

export type TimeSlice = { from: number; to: number };

/**
 * Fatia a janela [now - weeksBack, now + weeksAhead + 1 semana] em semanas
 * ordenadas do presente para fora (semana atual primeiro; depois alternando
 * futuro/passado), para que um erro ou truncamento tardio nunca deixe de
 * fora as semanas que a UI mais usa.
 */
export function buildWeekSlices(nowSeconds: number, weeksBack: number, weeksAhead: number): TimeSlice[] {
  const slices: TimeSlice[] = [];
  const at = (offset: number): TimeSlice => ({
    from: nowSeconds + offset * WEEK_SECONDS,
    to: nowSeconds + (offset + 1) * WEEK_SECONDS,
  });
  slices.push(at(0));
  const max = Math.max(weeksBack, weeksAhead + 1);
  for (let i = 1; i <= max; i += 1) {
    if (i <= weeksAhead) slices.push(at(i));
    if (i <= weeksBack) slices.push(at(-i));
  }
  return slices;
}

export type LoaderState = {
  /** Instante (ms) do último ciclo que terminou sem erro. null = nenhum ainda. */
  lastSuccessAt: number | null;
  /** O primeiro ciclo já terminou (com sucesso ou não)? */
  firstCycleDone: boolean;
  /** Quantas entradas futuras (airingAt >= agora) o último ciclo ingeriu. */
  upcomingEntries: number;
  /** Fatias cortadas pelo teto de paginação no último ciclo. */
  truncatedSlices: number;
  lastError: string | null;
};

export type LoaderHealth = { ok: boolean; status: "starting" | "ok" | "stale" | "no-upcoming-data"; reasons: string[] };

/**
 * Saúde verdadeira: depende do último ciclo, não de o processo estar de pé.
 * `maxStaleMs`: tolerância sem ciclo bem-sucedido (padrão sugerido: 2,5x o intervalo).
 */
export function evaluateLoaderHealth(state: LoaderState, nowMs: number, maxStaleMs: number): LoaderHealth {
  if (!state.firstCycleDone) return { ok: true, status: "starting", reasons: [] };
  const reasons: string[] = [];
  if (state.lastSuccessAt === null || nowMs - state.lastSuccessAt > maxStaleMs) {
    reasons.push(state.lastError ? `sem ciclo bem-sucedido recente: ${state.lastError}` : "sem ciclo bem-sucedido recente");
    return { ok: false, status: "stale", reasons };
  }
  if (state.upcomingEntries === 0) {
    reasons.push("o último ciclo não ingeriu nenhum episódio futuro");
    return { ok: false, status: "no-upcoming-data", reasons };
  }
  if (state.truncatedSlices > 0) reasons.push(`${state.truncatedSlices} fatia(s) truncada(s) pelo teto de paginação`);
  return { ok: true, status: "ok", reasons };
}

export type KeyedEntry = { id: string; anilistId: number; episode: number };

/**
 * Linhas do cache dentro da janela que a AniList NÃO devolveu mais (episódio
 * cancelado, renumerado ou removido) — "fantasmas" no calendário e nos
 * alertas (TR-015). Só vale para janelas lidas por inteiro (sem truncamento
 * nem erro), senão apagaria dado legítimo.
 */
export function findStaleEntryIds(
  existing: KeyedEntry[],
  fetched: Array<{ anilistId: number; episode: number }>
): string[] {
  const alive = new Set(fetched.map((e) => `${e.anilistId}:${e.episode}`));
  return existing.filter((row) => !alive.has(`${row.anilistId}:${row.episode}`)).map((row) => row.id);
}
