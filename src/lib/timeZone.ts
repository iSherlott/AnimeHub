/**
 * Fuso horário do usuário (D-07, recomendação): preferência por conta, com
 * "usar o fuso do dispositivo" como alternativa; padrão do produto
 * America/Sao_Paulo (Figma `8:3333`). Tudo aqui é puro (só Intl), para
 * testar com fusos diferentes e horário de verão.
 */
export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
export const DEVICE_TIME_ZONE = "device";

export const TIME_ZONE_OPTIONS = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Recife",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Lisbon",
  "Europe/London",
  "Asia/Tokyo",
  "UTC",
] as const;

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Resolve a preferência salva ("device", IANA ou vazio) para um fuso IANA válido. */
export function resolveTimeZone(preference: string | null | undefined, deviceZone?: string): string {
  if (preference === DEVICE_TIME_ZONE) {
    return deviceZone && isValidTimeZone(deviceZone) ? deviceZone : DEFAULT_TIME_ZONE;
  }
  return isValidTimeZone(preference) ? preference : DEFAULT_TIME_ZONE;
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsInZone(date: Date, timeZone: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const map: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") map[p.type] = Number(p.value);
  return { year: map.year, month: map.month, day: map.day, hour: map.hour, minute: map.minute, second: map.second };
}

/** Diferença (ms) entre o relógio de parede no fuso e UTC naquele instante. */
export function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante UTC em que é 00:00 do dia (ano/mês/dia) no fuso — respeitando horário de verão. */
function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const civilMidnight = Date.UTC(year, month - 1, day);
  let guess = civilMidnight;
  for (let i = 0; i < 3; i += 1) {
    guess = civilMidnight - zoneOffsetMs(new Date(guess), timeZone);
  }
  return new Date(guess);
}

export function startOfDayInZone(date: Date, timeZone: string): Date {
  const p = partsInZone(date, timeZone);
  return zonedMidnightUtc(p.year, p.month, p.day, timeZone);
}

/** Segunda-feira 00:00 da semana (+ offset em semanas) no fuso dado. */
export function startOfWeekMondayInZone(reference: Date, weekOffset: number, timeZone: string): Date {
  const p = partsInZone(reference, timeZone);
  // Dia da semana do calendário civil (independe do fuso da máquina).
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0=dom
  const daysSinceMonday = (weekday + 6) % 7;
  const civil = new Date(Date.UTC(p.year, p.month - 1, p.day - daysSinceMonday + weekOffset * 7));
  return zonedMidnightUtc(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate(), timeZone);
}

/** Os 7 dias (segunda→domingo) da semana, cada um como instante 00:00 no fuso. */
export function buildWeekDaysInZone(weekOffset: number, timeZone: string, reference: Date = new Date()): Date[] {
  const monday = startOfWeekMondayInZone(reference, weekOffset, timeZone);
  const p = partsInZone(monday, timeZone);
  return Array.from({ length: 7 }, (_, i) => {
    const civil = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
    return zonedMidnightUtc(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate(), timeZone);
  });
}

/** Chave estável YYYY-MM-DD do dia (no fuso) — para comparar/agrupar dias. */
export function dayKeyInZone(date: Date, timeZone: string): string {
  const p = partsInZone(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function formatTimeInZone(date: Date, timeZone: string, locale = "pt-BR"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

/** "Sábado", "Segunda" — nome do dia no fuso, capitalizado e sem "-feira" (como no Figma). */
export function weekdayName(date: Date, timeZone: string, locale = "pt-BR"): string {
  const name = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long" }).format(date).replace(/-feira$/, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Converte um horário de parede (`YYYY-MM-DDTHH:mm`, como o `<input type="datetime-local">`)
 * no fuso dado para o instante UTC — respeitando horário de verão. `null` se inválido.
 */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const civil = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(civil)) return null;
  let guess = civil;
  for (let i = 0; i < 3; i += 1) guess = civil - zoneOffsetMs(new Date(guess), timeZone);
  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? null : result;
}
