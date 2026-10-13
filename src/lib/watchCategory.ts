import type { SeasonRef } from "@/lib/exploreGroups";

/**
 * Em que pé está cada anime da lista da pessoa. Modo "misto": a pessoa pode marcar na mão
 * (`Anime.watchState`), e enquanto não marca a plataforma deduz do que já sabe — se há episódio adiado
 * ("parei no EP02"), se a obra está no ar nesta temporada ou se já terminou de ser exibida.
 */
/** DROPPED = vi até aqui e desisti: fora do calendário e sem avisos, e as próximas temporadas não entram sozinhas. */
export const WATCH_STATES = ["WATCHING", "UNFINISHED", "FINISHED", "DROPPED"] as const;
export type WatchState = (typeof WATCH_STATES)[number];

export function isWatchState(value: unknown): value is WatchState {
  return typeof value === "string" && (WATCH_STATES as readonly string[]).includes(value);
}

/** Categorias do perfil. `other` aparece só em "Todos" (em espera, ainda por estrear fora desta temporada…). */
export type WatchCategory = "watching" | "unfinished" | "finished" | "dropped" | "other";

export const CATEGORY_LABELS: Record<Exclude<WatchCategory, "other">, string> = {
  watching: "Acompanhando nesta temporada",
  unfinished: "Não terminei",
  finished: "Terminei",
  dropped: "Dropado",
};

export const STATE_LABELS: Record<WatchState, string> = {
  WATCHING: "Acompanhando",
  UNFINISHED: "Não terminei",
  FINISHED: "Terminei",
  DROPPED: "Dropei (parei aqui)",
};

const FROM_STATE: Record<WatchState, WatchCategory> = { WATCHING: "watching", UNFINISHED: "unfinished", FINISHED: "finished", DROPPED: "dropped" };

export type CategoryInput = {
  watchState: string | null;
  /** Há episódio adiado em "Para assistir". */
  hasPending: boolean;
  waiting: boolean;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
};

export function deriveCategory(input: CategoryInput, current: SeasonRef): WatchCategory {
  if (isWatchState(input.watchState)) return FROM_STATE[input.watchState];
  if (input.hasPending) return "unfinished";
  if (input.waiting) return "other";
  if (input.status === "RELEASING") return "watching";
  // Sequência que estreia nesta temporada conta como acompanhada; a que só estreia depois fica em "Todos".
  if (input.status === "NOT_YET_RELEASED") return input.season === current.season && input.seasonYear === current.year ? "watching" : "other";
  if (input.status === "FINISHED") return "finished";
  return "other";
}
