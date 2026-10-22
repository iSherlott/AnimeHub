import { KIND_LABELS, type Kind } from "@/lib/curation/kind";

/** Rótulos da ficha de uma obra (Epic 49), iguais nas páginas de quem acompanha a obra e na pública. */
export const FORMAT_LABEL: Record<string, string> = { TV: "TV", TV_SHORT: "TV curta", MOVIE: "Filme", OVA: "OVA", ONA: "ONA", SPECIAL: "Especial", MUSIC: "Música" };
export const STATUS_LABEL: Record<string, string> = { RELEASING: "Em exibição", FINISHED: "Finalizado", NOT_YET_RELEASED: "Ainda não lançado", CANCELLED: "Cancelado", HIATUS: "Em hiato" };
export const SEASON_LABEL: Record<string, string> = { WINTER: "Inverno", SPRING: "Primavera", SUMMER: "Verão", FALL: "Outono" };

export type WorkFactsInput = {
  kind?: string | null;
  format?: string | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  episodes?: number | null;
};

/** "Série (TV)", "Filme", "OVA (OVA)"… o tipo na história e o formato da fonte. */
export function typeLabel({ kind, format }: Pick<WorkFactsInput, "kind" | "format">): string | null {
  const formatLabel = format ? (FORMAT_LABEL[format] ?? format) : null;
  const kindLabel = kind === "EPISODE" ? "Série" : kind ? (KIND_LABELS[kind as Kind] ?? kind) : null;
  if (kindLabel && formatLabel && kindLabel !== formatLabel) return `${kindLabel} (${formatLabel})`;
  return kindLabel ?? formatLabel;
}

export function seasonLabel({ season, seasonYear }: Pick<WorkFactsInput, "season" | "seasonYear">): string | null {
  if (season && seasonYear) return `${SEASON_LABEL[season] ?? season} ${seasonYear}`;
  return seasonYear ? String(seasonYear) : null;
}

export function statusLabel(status: string | null | undefined): string | null {
  return status ? (STATUS_LABEL[status] ?? status) : null;
}

export function episodesLabel(episodes: number | null | undefined): string | null {
  return episodes ? `${episodes} ${episodes === 1 ? "episódio" : "episódios"}` : null;
}

/** As etiquetas curtas do topo da página (tipo, situação, época, episódios), só as que existem. */
export function workBadges(input: WorkFactsInput): string[] {
  return [typeLabel(input), statusLabel(input.status), seasonLabel(input), episodesLabel(input.episodes)].filter((s): s is string => Boolean(s));
}
