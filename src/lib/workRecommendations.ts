import { prisma } from "@/lib/prisma";
import { areFriends } from "@/lib/friends";
import { blockRelation } from "@/lib/blocks";
import { resolveWorkKey } from "@/lib/workRef";

/**
 * Recomendar uma obra a um amigo (10/11/2026): "manda pro Fulano", com um bilhete opcional, que chega no sino dele.
 * Regras contra spam: só entre amigos, sem bloqueio, uma vez por obra para a mesma pessoa, no máximo
 * `DAILY_LIMIT` por dia, e quem recebe pode desligar em Configurações.
 */
export const NOTE_MAX = 200;
export const DAILY_LIMIT = 10;

export type RecommendInput = { to?: unknown; work?: unknown; note?: unknown };
export type RecommendResult = { ok: true; id: string } | { ok: false; status: 400 | 403 | 404 | 409 | 429; error: string };

export async function recommendWork(fromId: string, input: RecommendInput, now = new Date()): Promise<RecommendResult> {
  const toId = typeof input.to === "string" ? input.to : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (!toId || toId === fromId) return { ok: false, status: 400, error: "Escolha um amigo." };
  if (note.length > NOTE_MAX) return { ok: false, status: 400, error: `O bilhete pode ter até ${NOTE_MAX} caracteres.` };
  const work = await resolveWorkKey(typeof input.work === "string" || typeof input.work === "number" ? input.work : null);
  if (!work) return { ok: false, status: 404, error: "Obra não encontrada." };
  if (!(await areFriends(fromId, toId)) || (await blockRelation(fromId, toId)) !== "none") return { ok: false, status: 403, error: "Só dá para recomendar a um amigo." };

  const since = new Date(now.getTime() - 24 * 3600 * 1000);
  if ((await prisma.workRecommendation.count({ where: { fromId, createdAt: { gte: since } } })) >= DAILY_LIMIT) {
    return { ok: false, status: 429, error: `Você já mandou ${DAILY_LIMIT} recomendações hoje. Tente amanhã.` };
  }
  const existing = await prisma.workRecommendation.findUnique({ where: { fromId_toId_workKey: { fromId, toId, workKey: work.key } }, select: { id: true } });
  if (existing) return { ok: false, status: 409, error: "Você já recomendou esta obra para essa pessoa." };

  const rec = await prisma.workRecommendation.create({
    data: { fromId, toId, workKey: work.key, catalogEntryId: work.catalogEntryId, titleRomaji: work.titleRomaji, titleEnglish: work.titleEnglish, coverImage: work.coverImage, note: note || null },
  });
  const recipient = await prisma.user.findUnique({ where: { id: toId }, select: { notifyRecommendations: true } });
  if (recipient?.notifyRecommendations) {
    await prisma.socialNotification.create({ data: { userId: toId, actorId: fromId, type: "WORK_RECOMMENDATION", recommendationId: rec.id } }).catch(() => undefined);
  }
  return { ok: true, id: rec.id };
}

/** Amigos para o seletor, com quem já recebeu esta obra de mim (e quem já a acompanha) marcado. */
export async function recommendTargets(fromId: string, workKey: string) {
  const work = await resolveWorkKey(workKey);
  const links = await prisma.friendship.findMany({ where: { OR: [{ userAId: fromId }, { userBId: fromId }] }, select: { userAId: true, userBId: true } });
  const ids = links.map((l) => (l.userAId === fromId ? l.userBId : l.userAId));
  if (ids.length === 0 || !work) return [];
  const [people, sent, following] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, handle: true }, orderBy: { displayName: "asc" } }),
    prisma.workRecommendation.findMany({ where: { fromId, toId: { in: ids }, workKey: work.key }, select: { toId: true } }),
    prisma.anime.findMany({
      where: { userId: { in: ids }, user: { animeListPublic: true }, ...(work.anilistId !== null ? { anilistId: work.anilistId } : { catalogEntryId: work.catalogEntryId }) },
      select: { userId: true },
    }),
  ]);
  const sentTo = new Set(sent.map((s) => s.toId));
  const follows = new Set(following.map((f) => f.userId));
  return people.map((p) => ({ ...p, alreadySent: sentTo.has(p.id), follows: follows.has(p.id) }));
}

/** O que os amigos me recomendaram (mais recente primeiro). */
export async function receivedRecommendations(userId: string, take = 20) {
  const rows = await prisma.workRecommendation.findMany({
    where: { toId: userId },
    orderBy: { createdAt: "desc" },
    take,
    include: { from: { select: { id: true, displayName: true, handle: true } } },
  });
  return rows.map((r) => ({ id: r.id, workKey: r.workKey, titleRomaji: r.titleRomaji, titleEnglish: r.titleEnglish, coverImage: r.coverImage, note: r.note, createdAt: r.createdAt.toISOString(), from: r.from }));
}
