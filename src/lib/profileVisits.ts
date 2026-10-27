import { prisma } from "@/lib/prisma";
import { blockedUserIdSet, blockRelation } from "@/lib/blocks";

/**
 * Visitas ao perfil (como no Orkut). Guarda a última visita de cada pessoa com conta a cada perfil; só a dona do perfil
 * vê quem visitou, nos últimos 90 dias. Reciprocidade: quem desliga "Registrar minhas visitas" (Configurações) não
 * aparece para ninguém — nem nas visitas antigas — e também não vê quem visitou o perfil dela.
 */
export const VISITS_WINDOW_DAYS = 90;

/** Registra a visita (a própria pessoa, bloqueio entre as duas ou registro desligado não contam). Nunca lança. */
export async function recordVisit(visitor: { id: string; recordVisits: boolean } | null, profileId: string): Promise<void> {
  try {
    if (!visitor || visitor.id === profileId || !visitor.recordVisits) return;
    if ((await blockRelation(visitor.id, profileId)) !== "none") return;
    const now = new Date();
    await prisma.profileVisit.upsert({ where: { profileId_visitorId: { profileId, visitorId: visitor.id } }, create: { profileId, visitorId: visitor.id, visitedAt: now }, update: { visitedAt: now } });
  } catch (error) {
    console.error("[profileVisits] falhou:", error);
  }
}

/** Quem visitou (mais recentes primeiro): só de quem mantém o registro ligado e sem bloqueios. */
export async function recentVisitors(profileId: string, take = 9, now: Date = new Date()) {
  const blocked = [...(await blockedUserIdSet(profileId))];
  const where = {
    profileId,
    visitedAt: { gte: new Date(now.getTime() - VISITS_WINDOW_DAYS * 86_400_000) },
    visitor: { recordVisits: true, ...(blocked.length ? { id: { notIn: blocked } } : {}) },
  };
  const [total, rows] = await Promise.all([
    prisma.profileVisit.count({ where }),
    prisma.profileVisit.findMany({ where, orderBy: { visitedAt: "desc" }, take, include: { visitor: { select: { id: true, displayName: true, handle: true, avatarUrl: true } } } }),
  ]);
  return { total, rows: rows.map((r) => ({ ...r.visitor, visitedAt: r.visitedAt })) };
}
