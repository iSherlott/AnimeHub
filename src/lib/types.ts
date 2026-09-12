export const WATCH_STATUSES = [
  "WATCHING",
  "COMPLETED",
  "PLAN_TO_WATCH",
  "PAUSED",
  "DROPPED",
] as const;

export type WatchStatus = (typeof WATCH_STATUSES)[number];

export const WATCH_STATUS_LABELS: Record<WatchStatus, string> = {
  WATCHING: "Assistindo",
  COMPLETED: "Completo",
  PLAN_TO_WATCH: "Quero assistir",
  PAUSED: "Pausado",
  DROPPED: "Abandonado",
};

/** Cada status tem sua própria família de cor, pra nunca virar ambíguo. */
export const WATCH_STATUS_BADGE_CLASSES: Record<WatchStatus, string> = {
  WATCHING: "bg-status-watching text-text-primary",
  COMPLETED: "bg-status-completed text-ink",
  PLAN_TO_WATCH: "bg-status-planned text-ink",
  PAUSED: "bg-status-paused text-ink",
  DROPPED: "border border-status-dropped text-text-muted bg-transparent",
};

/** Status de exibição do anime em si (AniList), não confundir com WatchStatus. */
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
] as const;

export type KnownPlatform = (typeof KNOWN_PLATFORMS)[number];
