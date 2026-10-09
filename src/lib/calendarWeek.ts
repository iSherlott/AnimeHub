/**
 * Semana do calendário: SEGUNDA → DOMINGO (Figma `8:2106`: "SEG 05 … DOM 11";
 * D-08). Calculada no fuso da máquina que chama (o navegador envia o início
 * da semana ao servidor como timestamp absoluto — ver /api/calendar).
 */
export function startOfWeekMonday(reference: Date, weekOffset = 0): Date {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const daysSinceMonday = (start.getDay() + 6) % 7; // seg=0 … dom=6
  start.setDate(start.getDate() - daysSinceMonday + weekOffset * 7);
  return start;
}

export function buildWeekDays(weekOffset: number, reference: Date = new Date()): Date[] {
  const monday = startOfWeekMonday(reference, weekOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}
