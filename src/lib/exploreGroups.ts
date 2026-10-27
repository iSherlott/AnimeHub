import type { DiscoverItem } from "@/lib/discoverItem";
import { animeSeasonOf, isExactStartDate } from "@/lib/calendarOffGrid";

/**
 * Regras puras de Explorar (Figma `8:1361`) e Temporada (`8:1733`): quem vai
 * em "Em destaque"/"Em exibição" (tem horário confirmado) e quem fica em
 * "Novas histórias, outros tempos"/"Estreias e datas a confirmar" (nunca com
 * horário inventado), além dos identificadores de temporada ("Autumn2026").
 */

export type SeasonName = "WINTER" | "SPRING" | "SUMMER" | "FALL";
export type SeasonRef = { season: SeasonName; year: number };

const SEASON_ORDER: SeasonName[] = ["WINTER", "SPRING", "SUMMER", "FALL"];

const SLUG_NAME: Record<SeasonName, string> = { WINTER: "winter", SPRING: "spring", SUMMER: "summer", FALL: "autumn" };

export const SEASON_COPY: Record<SeasonName, { kanji: string; range: string; labelPt: string }> = {
  WINTER: { kanji: "冬", range: "janeiro a março", labelPt: "Inverno" },
  SPRING: { kanji: "春", range: "abril a junho", labelPt: "Primavera" },
  SUMMER: { kanji: "夏", range: "julho a setembro", labelPt: "Verão" },
  FALL: { kanji: "秋", range: "outubro a dezembro", labelPt: "Outono" },
};

/** "Autumn2026" (rótulo do Figma). */
export function seasonLabel(ref: SeasonRef): string {
  const name = SLUG_NAME[ref.season];
  return `${name[0].toUpperCase()}${name.slice(1)}${ref.year}`;
}

/** "Outono 2026": o nome da temporada para quem usa o site (o formato técnico "Autumn2026" fica na URL, nos filtros do admin e nas importações). */
export function seasonDisplayName(ref: SeasonRef): string {
  return `${SEASON_COPY[ref.season].labelPt} ${ref.year}`;
}

/** "autumn2026" — o trecho da URL `/temporada/autumn2026`. */
export function seasonSlug(ref: SeasonRef): string {
  return seasonLabel(ref).toLowerCase();
}

export function parseSeasonSlug(slug: string): SeasonRef | null {
  const match = /^(winter|spring|summer|autumn|fall)(\d{4})$/.exec(slug.toLowerCase());
  if (!match) return null;
  const year = Number(match[2]);
  if (year < 1960 || year > 2100) return null;
  const season = match[1] === "autumn" || match[1] === "fall" ? "FALL" : (match[1].toUpperCase() as SeasonName);
  return { season, year };
}

export function currentSeasonRef(now: Date = new Date()): SeasonRef {
  return animeSeasonOf(now);
}

/** A temporada atual seguida das `count - 1` anteriores (mais recente primeiro). */
export function recentSeasons(now: Date, count: number): SeasonRef[] {
  const current = currentSeasonRef(now);
  const result: SeasonRef[] = [];
  let index = SEASON_ORDER.indexOf(current.season);
  let year = current.year;
  for (let i = 0; i < count; i += 1) {
    result.push({ season: SEASON_ORDER[index], year });
    index -= 1;
    if (index < 0) {
      index = SEASON_ORDER.length - 1;
      year -= 1;
    }
  }
  return result;
}

/**
 * Separa a temporada em "tem episódio com horário confirmado no futuro"
 * (ordenado pelo horário) e o resto (ordenado pela popularidade, quando houver).
 */
export function splitSeasonItems(items: DiscoverItem[], now: Date = new Date()): { airing: DiscoverItem[]; rest: DiscoverItem[] } {
  const isAiring = (item: DiscoverItem) => item.nextEpisodeAt !== null && new Date(item.nextEpisodeAt).getTime() >= now.getTime();
  const airing = items
    .filter(isAiring)
    .sort((a, b) => new Date(a.nextEpisodeAt as string).getTime() - new Date(b.nextEpisodeAt as string).getTime());
  const rest = items.filter((item) => !isAiring(item)).sort((a, b) => (a.popularityRank ?? 9999) - (b.popularityRank ?? 9999));
  return { airing, rest };
}

export type ScheduleInfo =
  /** Horário confirmado (ISO). */
  | { kind: "scheduled"; at: string; episode: number | null }
  /** Dia exato conhecido, sem horário (`YYYY-MM-DD`). */
  | { kind: "known-day"; day: string }
  /** Nenhuma previsão confiável. */
  | { kind: "tbd"; reason: "undated" | "postponed" };

/** O que mostrar no lugar do horário: nunca uma data inventada. */
export function scheduleOf(item: DiscoverItem, now: Date = new Date()): ScheduleInfo {
  if (item.nextEpisodeAt && new Date(item.nextEpisodeAt).getTime() >= now.getTime()) {
    return { kind: "scheduled", at: item.nextEpisodeAt, episode: item.nextEpisodeNumber };
  }
  if (item.status === "HIATUS") return { kind: "tbd", reason: "postponed" };
  if (item.status === "NOT_YET_RELEASED" && item.startDate) {
    const start = new Date(item.startDate);
    if (isExactStartDate(start) && start.getTime() >= now.getTime() - 86400_000) {
      return { kind: "known-day", day: start.toISOString().slice(0, 10) };
    }
  }
  return { kind: "tbd", reason: "undated" };
}
