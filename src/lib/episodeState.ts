/**
 * Episódio global (Fase 4, ADR 0009): o mesmo registro para todo mundo, sem nada de progresso pessoal. Três dimensões
 * separadas, porque são coisas diferentes:
 *  - certeza da data (`dateCertainty`): EXACT (dia e hora) | DATE_ONLY (só o dia) | UNKNOWN (sem data);
 *  - situação informada (`status`): ACTIVE | POSTPONED | CANCELLED — vem da fonte ou do admin;
 *  - exibido ou não: derivado da data (nunca guardado), e só quando a data é conhecida.
 * Horário nunca é inventado: sem hora, o episódio não vira um instante fictício no calendário.
 */
export const DATE_CERTAINTIES = ["EXACT", "DATE_ONLY", "UNKNOWN"] as const;
export type DateCertainty = (typeof DATE_CERTAINTIES)[number];
export const EPISODE_STATUSES = ["ACTIVE", "POSTPONED", "CANCELLED"] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

export type ReleaseState = "AIRED" | "SCHEDULED" | "EXPECTED" | "UNKNOWN_DATE" | "POSTPONED" | "CANCELLED";

export const RELEASE_STATE_LABELS: Record<ReleaseState, string> = {
  AIRED: "Exibido",
  SCHEDULED: "Agendado (dia e hora)",
  EXPECTED: "Previsto (só o dia)",
  UNKNOWN_DATE: "Data desconhecida",
  POSTPONED: "Adiado",
  CANCELLED: "Cancelado",
};

export const CERTAINTY_LABELS: Record<DateCertainty, string> = { EXACT: "dia e hora", DATE_ONLY: "só o dia", UNKNOWN: "sem data" };
export const SOURCE_LABELS: Record<string, string> = { anilist: "AniList", kitsu: "Kitsu", anidb: "AniDB", manual: "Admin", legacy: "cópia antiga (Kitsu/AniDB)" };

type DatedEpisode = { airingAt: Date | null; airDate: Date | null; status: string };

/** Dia seguinte ao `airDate` (00:00 UTC): só depois dele um episódio "só com o dia" conta como exibido. */
function dayAfter(airDate: Date): number {
  return Date.UTC(airDate.getUTCFullYear(), airDate.getUTCMonth(), airDate.getUTCDate() + 1);
}

/** Já foi ao ar? Só responde sim com data conhecida e sem cancelamento; adiado com data antiga também não conta. */
export function hasAired(ep: DatedEpisode, now: Date = new Date()): boolean {
  if (ep.status === "CANCELLED" || ep.status === "POSTPONED") return false;
  if (ep.airingAt) return ep.airingAt.getTime() <= now.getTime();
  if (ep.airDate) return dayAfter(ep.airDate) <= now.getTime();
  return false;
}

export function releaseState(ep: DatedEpisode, now: Date = new Date()): ReleaseState {
  if (ep.status === "CANCELLED") return "CANCELLED";
  if (ep.status === "POSTPONED") return "POSTPONED";
  if (hasAired(ep, now)) return "AIRED";
  if (ep.airingAt) return "SCHEDULED";
  if (ep.airDate) return "EXPECTED";
  return "UNKNOWN_DATE";
}

/** Certeza coerente com os valores: com instante é EXACT, só com o dia é DATE_ONLY, sem nada é UNKNOWN. */
export function certaintyFor(airingAt: Date | null, airDate: Date | null): DateCertainty {
  if (airingAt) return "EXACT";
  return airDate ? "DATE_ONLY" : "UNKNOWN";
}

/** Só os episódios com instante conhecido (os que entram no calendário). */
export function timed<T extends { airingAt: Date | null }>(rows: T[]): Array<T & { airingAt: Date }> {
  return rows.filter((r): r is T & { airingAt: Date } => r.airingAt !== null);
}

/** Só os episódios de obras da AniList (as que têm página e calendário); obras só do AniDB ficam de fora. */
export function withAnilist<T extends { anilistId: number | null }>(rows: T[]): Array<T & { anilistId: number }> {
  return rows.filter((r): r is T & { anilistId: number } => r.anilistId !== null);
}
