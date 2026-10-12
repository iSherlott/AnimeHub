import { prisma } from "@/lib/prisma";

/** A AniList mexe nos horários o tempo todo; só acima disto vale avisar "Data alterada". */
export const RESCHEDULE_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * O episódio foi reagendado de verdade? Só conta quando o horário ANTIGO ou
 * o NOVO ainda está no futuro (episódio já exibido que a AniList corrige
 * depois não é "adiamento") e a diferença passa do limiar.
 */
export function isReschedule(previous: Date, next: Date, now: Date = new Date()): boolean {
  if (Math.abs(previous.getTime() - next.getTime()) <= RESCHEDULE_THRESHOLD_MS) return false;
  return previous.getTime() > now.getTime() || next.getTime() > now.getTime();
}

/**
 * Cria/atualiza o alerta "Data alterada" de quem acompanha a obra e quer
 * avisos de lançamentos. Um alerta por (pessoa, obra, episódio); o horário
 * anterior fica guardado para a mensagem "era 21:00, agora 22:30". Nunca
 * lança — o loader não pode falhar por causa de um aviso.
 */
export async function recordRescheduleAlerts(
  anilistId: number,
  episode: number,
  previous: Date,
  next: Date
): Promise<number> {
  try {
    const followers = await prisma.anime.findMany({
      where: { anilistId, userId: { not: null }, waiting: false, user: { is: { notifyReleases: true } } },
      select: { userId: true },
    });
    let count = 0;
    for (const f of followers) {
      const userId = f.userId as string;
      try {
        await prisma.airingAlert.upsert({
          where: { userId_anilistId_episode: { userId, anilistId, episode } },
          create: { userId, anilistId, episode, airingAt: next, previousAiringAt: previous },
          update: { airingAt: next, previousAiringAt: previous, seenAt: null },
        });
        count++;
      } catch (error) {
        console.error("[reschedule] alerta falhou:", error);
      }
    }
    return count;
  } catch (error) {
    console.error("[reschedule] falhou:", error);
    return 0;
  }
}
