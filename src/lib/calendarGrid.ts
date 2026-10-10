/**
 * Agenda semanal em grade de horas (Figma `8:2106`): cada lançamento ocupa um
 * bloco posicionado pelo horário de exibição. Esta é a geometria pura (testável)
 * usada por CalendarDayColumn.
 */

/** Um dia tem 24 linhas de hora; o eixo rotula de 2 em 2 horas. */
export const HOURS_PER_DAY = 24;
/** Altura de um bloco, em minutos de grade (64 px a 40 px/h = 96 min no Figma). */
export const BLOCK_MINUTES = 96;

/** Minutos desde 00:00 a partir de "HH:MM" (formato de formatTimeInZone). */
export function minutesFromClock(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export type LaidOut = { index: number; lane: number; lanes: number };

/**
 * Distribui blocos que se sobrepõem em faixas lado a lado (como uma agenda):
 * quem não colide ocupa a largura toda; um grupo de N blocos que se tocam
 * divide a coluna em N faixas iguais. Entrada: minutos de início, qualquer
 * ordem; saída na mesma ordem de entrada.
 */
export function layoutDayEvents(starts: number[], blockMinutes: number = BLOCK_MINUTES): LaidOut[] {
  const order = starts.map((start, index) => ({ start, index })).sort((a, b) => a.start - b.start || a.index - b.index);
  const result: LaidOut[] = new Array(starts.length);

  let cluster: Array<{ start: number; index: number; lane: number }> = [];
  let clusterEnd = -Infinity;
  const laneEnds: number[] = [];

  const flush = () => {
    const lanes = laneEnds.length || 1;
    for (const e of cluster) result[e.index] = { index: e.index, lane: e.lane, lanes };
    cluster = [];
    laneEnds.length = 0;
    clusterEnd = -Infinity;
  };

  for (const e of order) {
    if (cluster.length > 0 && e.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= e.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e.start + blockMinutes);
    } else {
      laneEnds[lane] = e.start + blockMinutes;
    }
    cluster.push({ ...e, lane });
    clusterEnd = Math.max(clusterEnd, e.start + blockMinutes);
  }
  if (cluster.length > 0) flush();
  return result;
}
