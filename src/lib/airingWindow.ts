import { dayKeyInZone } from "@/lib/timeZone";

/**
 * Janela de "no ar agora": um pouco antes (episódio recém-começou) até bem
 * depois (dá tempo da pessoa ver o alerta mesmo sem estar olhando no
 * instante exato) do horário de exibição confirmado pela AniList. Mesma
 * janela usada pelo sino de notificações (services/notifier) e pelo
 * indicador "NO AR" do calendário — uma fonte só, pra nunca discordarem.
 */
export const AIRING_WINDOW_BEFORE_MS = 5 * 60 * 1000;
export const AIRING_WINDOW_AFTER_MS = 30 * 60 * 1000;

/** `now` está dentro da janela de exibição do episódio (ver comentário acima). */
export function isAiringNow(airingAt: Date | string, now: Date = new Date()): boolean {
  const airingTime = new Date(airingAt).getTime();
  const nowTime = now.getTime();
  return nowTime >= airingTime - AIRING_WINDOW_BEFORE_MS && nowTime <= airingTime + AIRING_WINDOW_AFTER_MS;
}

/**
 * Mesma janela, mas como faixa de `airingAt` pra uma consulta no banco
 * (`WHERE airingAt BETWEEN from AND to`) — quem filtra por linha (o
 * services/notifier, que processa muitas entradas por tick) não pode chamar
 * `isAiringNow` por linha sem antes buscá-las, então precisa da desigualdade
 * invertida (a faixa de `airingAt` que deixaria `isAiringNow(airingAt, now)`
 * verdadeiro pro `now` atual). Calculada aqui, uma vez só, em vez de cada
 * consumidor reimplementar essa inversão à mão — foi exatamente aí que a
 * janela do notifier saiu dessincronizada da do calendário da primeira vez.
 */
export function airingAtRangeForNow(now: Date = new Date()): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - AIRING_WINDOW_AFTER_MS),
    to: new Date(now.getTime() + AIRING_WINDOW_BEFORE_MS),
  };
}

/** Quanto antes do horário o aviso "hoje tem episódio" já aparece no sino. */
export const NOTIFY_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

/**
 * O aviso de lançamento é do DIA DE HOJE (no fuso de quem acompanha): vale para um episódio que vai ao ar ainda hoje ou que
 * acabou de ir ao ar (a cauda da janela de exibição, que pode cruzar a meia-noite). Um episódio de amanhã — mesmo a menos de
 * 24 h — não gera aviso: aparecia "um dia antes" no sino.
 */
export function isTodaysRelease(airingAt: Date | string, now: Date, timeZone: string): boolean {
  const airing = new Date(airingAt);
  if (airing.getTime() < now.getTime() - AIRING_WINDOW_AFTER_MS) return false; // já foi há muito tempo
  if (airing.getTime() <= now.getTime()) return true; // acabou de ir ao ar
  return dayKeyInZone(airing, timeZone) === dayKeyInZone(now, timeZone);
}

/**
 * Faixa de `airingAt` que gera aviso no sino: de "acabou de ir ao ar" (a mesma
 * cauda da janela de exibição) até 24 h à frente. É só a faixa para a consulta; quem decide se o episódio é de HOJE no fuso da
 * pessoa é `isTodaysRelease` (a consulta traz um pouco a mais para cobrir qualquer fuso).
 */
export function notifyRangeForNow(now: Date = new Date()): { from: Date; to: Date } {
  return {
    from: new Date(now.getTime() - AIRING_WINDOW_AFTER_MS),
    to: new Date(now.getTime() + NOTIFY_LOOKAHEAD_MS),
  };
}
