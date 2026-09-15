const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Horário relativo estilo Twitter/Instagram ("agora", "5 min", "3 h",
 * "2 d") — cai pra data absoluta (dd/mm) depois de 1 semana, onde o
 * relativo deixa de ser útil de bater o olho.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < MINUTE) return "agora";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)} d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
