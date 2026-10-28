/**
 * Estados do calendário que NUNCA ganham posição inventada na grade (Figma
 * `8:2106`, D-25 / CAL-003 / CAL-004): "Sem horário definido", "Data não
 * definida" e "Adiado". Tudo aqui é puro; a rota só alimenta com linhas do
 * cache (`AiringScheduleEntry` / `CatalogEntry`).
 *
 * O "Atrasado" (horário previsto passou e a fonte não confirmou) saiu em 28/10:
 * os atrasos vão ser cuidados por um agente próprio, depois.
 */

/**
 * - `dated`: estreia com DIA conhecido, sem horário → painel "Sem horário definido".
 * - `undated`: sem data confiável → painel "Data não definida".
 * - `postponed`: em hiato → "Adiado · nova data a confirmar".
 */
export type OffGridKind = "dated" | "undated" | "postponed";

export type OffGridItem = {
  key: string;
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  kind: OffGridKind;
  /** Dia civil `YYYY-MM-DD` — só quando `kind === "dated"`. */
  startDate: string | null;
  episode: number | null;
  inMyList: boolean;
};

type OffGridSource = {
  status: string | null;
  startDate: Date | null;
};

/**
 * A AniList manda datas parciais (só ano, ou ano+mês); o catálogo as grava
 * como dia 1. Para nunca tratar uma data inventada como real, só um dia ≠ 1
 * conta como "data conhecida".
 */
export function isExactStartDate(date: Date | null): date is Date {
  return date !== null && date.getUTCDate() !== 1;
}

export function classifyOffGrid(row: OffGridSource): OffGridKind | null {
  if (row.status === "HIATUS") return "postponed";
  if (row.status === "NOT_YET_RELEASED") return isExactStartDate(row.startDate) ? "dated" : "undated";
  return null;
}

export function civilDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;

/** Temporada de anime (jan–mar inverno … out–dez outono) do instante dado, em UTC. */
export function animeSeasonOf(date: Date): { season: (typeof SEASONS)[number]; year: number } {
  return { season: SEASONS[Math.floor(date.getUTCMonth() / 3)], year: date.getUTCFullYear() };
}
