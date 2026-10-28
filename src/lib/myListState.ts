import { civilDay, classifyOffGrid, isExactStartDate } from "@/lib/calendarOffGrid";

/**
 * Situação de agenda de cada obra acompanhada (Figma `8:2608`): quando há um
 * episódio com horário confirmado, ele manda; senão, nunca uma data inventada —
 * o item cai em "Adiado", "Sem horário definido" ou "Data não definida". (O
 * "Atrasado" saiu em 28/10: os atrasos vão ser cuidados por um agente próprio.)
 */
export type MyListState =
  | { kind: "scheduled"; at: string; episode: number }
  /** Estreia com dia exato conhecido, sem horário (`YYYY-MM-DD`). */
  | { kind: "dated"; day: string; episode: number | null }
  | { kind: "postponed" }
  | { kind: "undated" }
  /** Finalizada/cancelada: nada a esperar. */
  | { kind: "none" };

export type MyListStateInput = {
  /** Próximo episódio com horário confirmado no futuro (cache do calendário). */
  upcoming: { airingAt: Date; episode: number } | null;
  /** Linha do catálogo da obra (status, estreia e "próximo episódio" da fonte). */
  catalog: {
    status: string | null;
    startDate: Date | null;
    nextEpisodeNumber: number | null;
    nextEpisodeAt: Date | null;
  } | null;
  now?: Date;
};

export function myListStateOf({ upcoming, catalog, now = new Date() }: MyListStateInput): MyListState {
  if (upcoming) return { kind: "scheduled", at: upcoming.airingAt.toISOString(), episode: upcoming.episode };
  if (!catalog) return { kind: "undated" };

  if (catalog.status === "FINISHED" || catalog.status === "CANCELLED") return { kind: "none" };
  const kind = classifyOffGrid(catalog);
  if (kind === "postponed") return { kind: "postponed" };
  if (kind === "dated" && isExactStartDate(catalog.startDate) && catalog.startDate.getTime() >= now.getTime() - 86400_000) {
    return { kind: "dated", day: civilDay(catalog.startDate), episode: catalog.nextEpisodeNumber };
  }
  return { kind: "undated" };
}
