/** Status de exibição do anime em si (AniList), (não existe status de consumo: P-3). */
export const CATALOG_STATUSES = [
  "RELEASING",
  "FINISHED",
  "NOT_YET_RELEASED",
  "HIATUS",
  "CANCELLED",
] as const;

export const CATALOG_STATUS_LABELS: Record<string, string> = {
  RELEASING: "Lançando",
  FINISHED: "Completo",
  NOT_YET_RELEASED: "Em breve",
  HIATUS: "Em hiato",
  CANCELLED: "Cancelado",
};

export const SEASON_LABELS: Record<string, string> = {
  WINTER: "Inverno",
  SPRING: "Primavera",
  SUMMER: "Verão",
  FALL: "Outono",
};

export const KNOWN_PLATFORMS = [
  "Crunchyroll",
  "Netflix",
  "HIDIVE",
  "Prime Video",
  "Disney+",
  // Sites não oficiais (que têm anime pirata): a pessoa guarda só para si o link de onde assiste.
  "Irregular",
] as const;

export type KnownPlatform = (typeof KNOWN_PLATFORMS)[number];

/** A plataforma "Irregular" agrupa vários sites; o rótulo dela não leva "na ...". */
export const IRREGULAR_PLATFORM: KnownPlatform = "Irregular";

export function platformWatchLabel(platform: string): string {
  return platform === IRREGULAR_PLATFORM ? "Assistir (irregular)" : `Assistir na ${platform}`;
}
