import { isTodaysRelease } from "@/lib/airingWindow";

type AlertLike = { kind: string; previousAiringAt: Date | null; airingAt: Date };

/**
 * O aviso aparece no sino agora? Lançamento comum só vale no dia dele: o aviso criado "um dia antes" (episódio de amanhã)
 * fica escondido até o dia chegar. "Data alterada" e "voltou a sair episódios" aparecem sempre, porque falam de uma data
 * futura de propósito.
 */
export function isAlertVisible(alert: AlertLike, now: Date, timeZone: string): boolean {
  return alert.kind !== "EPISODE" || alert.previousAiringAt !== null || alert.airingAt.getTime() <= now.getTime() || isTodaysRelease(alert.airingAt, now, timeZone);
}

/** Evento do navegador: os avisos de uma obra foram vistos fora do sino (ex.: abrindo a prévia no calendário). */
export const ALERTS_SEEN_EVENT = "animehub:alerts-seen";
export type AlertsSeenDetail = { anilistId: number };
