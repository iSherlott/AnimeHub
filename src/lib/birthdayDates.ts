/**
 * Datas de aniversário (só dia e mês), sem banco: valida, formata e diz que datas caem nos próximos dias. Usado no
 * navegador (Editar perfil) e no servidor (`src/lib/birthdays.ts`).
 */
export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"] as const;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Dia e mês válidos (29/02 vale). Os dois juntos ou nenhum (null limpa). */
export function validateBirthday(day: unknown, month: unknown): { ok: true; value: { birthDay: number | null; birthMonth: number | null } } | { ok: false; error: string } {
  if ((day === null || day === undefined || day === "") && (month === null || month === undefined || month === "")) return { ok: true, value: { birthDay: null, birthMonth: null } };
  const d = Number(day);
  const m = Number(month);
  if (!Number.isInteger(d) || !Number.isInteger(m) || m < 1 || m > 12 || d < 1 || d > DAYS_IN_MONTH[m - 1]) return { ok: false, error: "Aniversário inválido: escolha o dia e o mês." };
  return { ok: true, value: { birthDay: d, birthMonth: m } };
}

export function formatBirthday(day: number, month: number): string {
  return `${day} de ${MONTHS[month - 1]}`;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Dia, mês e ano no fuso. */
export function monthDayInZone(date: Date, timeZone: string): { day: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { day: get("day"), month: get("month"), year: get("year") };
}

/**
 * Os próximos `days` dias (hoje = 0) como as datas de aniversário que caem em cada um: em 28/02 de ano não bissexto,
 * também 29/02.
 */
export function upcomingBirthdayKeys(now: Date, timeZone: string, days: number): Array<{ day: number; month: number; inDays: number }> {
  const out: Array<{ day: number; month: number; inDays: number }> = [];
  // Conta pelo calendário (não somando 24 h), para a troca de horário de verão não pular nem repetir um dia.
  const today = monthDayInZone(now, timeZone);
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    const day = date.getUTCDate();
    const month = date.getUTCMonth() + 1;
    const year = date.getUTCFullYear();
    out.push({ day, month, inDays: i });
    if (month === 2 && day === 28 && !isLeap(year)) out.push({ day: 29, month: 2, inDays: i });
  }
  return out;
}
