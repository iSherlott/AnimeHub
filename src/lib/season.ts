/**
 * Temporada atual de anime para a hashtag da lateral "Conversas da
 * temporada" (Figma `13:41368`: `#AnimeFall2026` · "Autumn2026 · Outono 2026").
 * Quadrimestres de anime: jan–mar inverno, abr–jun primavera, jul–set verão,
 * out–dez outono.
 */
export type SeasonInfo = {
  /** Nome em inglês usado na hashtag (Winter/Spring/Summer/Fall). */
  english: "Winter" | "Spring" | "Summer" | "Fall";
  /** Rótulo "Autumn2026"-style do Figma. */
  label: string;
  labelPt: "Inverno" | "Primavera" | "Verão" | "Outono";
  year: number;
  /** Texto da hashtag sem "#" (ex.: "AnimeFall2026"). */
  tag: string;
  /** ID canônico (minúsculas). */
  key: string;
};

export function currentSeasonTag(now: Date, timeZone = "America/Sao_Paulo"): SeasonInfo {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(now).split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const idx = Math.floor((month - 1) / 3);
  const english = (["Winter", "Spring", "Summer", "Fall"] as const)[idx];
  const labelPt = (["Inverno", "Primavera", "Verão", "Outono"] as const)[idx];
  const label = `${english === "Fall" ? "Autumn" : english}${year}`;
  const tag = `Anime${english}${year}`;
  return { english, label, labelPt, year, tag, key: tag.toLowerCase() };
}
