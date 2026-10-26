import { prisma } from "@/lib/prisma";
import { blockedUserIdSet, blockRelation } from "@/lib/blocks";
import { isBlank } from "@/lib/text";
import { notifySocial } from "@/lib/socialNotifications";
import { areFriends } from "@/lib/friends";

/**
 * Perfil estilo Orkut, com o tema do Anime Hub: recados (qualquer conta), depoimentos (só amigos, com aprovação), fãs e
 * avaliações (só amigos). Amizade: pedido aceito (`src/lib/friends.ts`). Bloqueio entre as duas pessoas impede tudo isso
 * e esconde o que uma escreveu para a outra.
 */
export const SCRAP_MAX = 1000;
export const TESTIMONIAL_MAX = 2000;
export const SCRAPS_PAGE = 20;
export const RATING_KEYS = ["otaku", "gentil", "semSpoiler"] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
export const RATING_LABELS: Record<RatingKey, string> = { otaku: "Otaku raiz", gentil: "Gente boa", semSpoiler: "Sem spoiler" };

export type ProfileError = { ok: false; status: 400 | 403 | 404 | 409; error: string };

const AUTHOR = { select: { id: true, displayName: true, handle: true, avatarUrl: true } } as const;
const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Pode interagir (recado, fã…) com o perfil: há conta, não é bloqueio entre as duas pessoas. */
async function canInteract(viewerId: string, profileId: string): Promise<ProfileError | null> {
  const profile = await prisma.user.findUnique({ where: { id: profileId }, select: { id: true } });
  if (!profile) return { ok: false, status: 404, error: "Perfil não encontrado." };
  if ((await blockRelation(viewerId, profileId)) !== "none") return { ok: false, status: 403, error: "Não é possível interagir com este perfil." };
  return null;
}

// ---------- Recados ----------

export async function listScraps(profileId: string, page: number, viewerId: string | null, take = SCRAPS_PAGE) {
  const blocked = [...(await blockedUserIdSet(viewerId))];
  const where = { profileId, deletedAt: null, ...(blocked.length ? { authorId: { notIn: blocked } } : {}) };
  const [total, rows] = await Promise.all([prisma.scrap.count({ where }), prisma.scrap.findMany({ where, orderBy: { createdAt: "desc" }, skip: page * take, take, include: { author: AUTHOR } })]);
  return { total, rows };
}

export async function createScrap(profileId: string, authorId: string, input: unknown): Promise<{ ok: true; id: string } | ProfileError> {
  const body = clean((input as { body?: unknown } | null)?.body);
  if (isBlank(body) || body.length > SCRAP_MAX) return { ok: false, status: 400, error: `Recado de 1 a ${SCRAP_MAX.toLocaleString("pt-BR")} caracteres.` };
  const denied = await canInteract(authorId, profileId);
  if (denied) return denied;
  const scrap = await prisma.scrap.create({ data: { profileId, authorId, body }, select: { id: true } });
  await notifySocial({ type: "PROFILE_SCRAP", recipientId: profileId, actorId: authorId });
  return { ok: true, id: scrap.id };
}

/** Apagar o recado: quem recebeu, quem escreveu ou a moderação. */
export async function deleteScrap(scrapId: string, user: { id: string; canModerate: boolean }): Promise<{ ok: true } | ProfileError> {
  const scrap = await prisma.scrap.findUnique({ where: { id: scrapId }, select: { profileId: true, authorId: true, deletedAt: true } });
  if (!scrap || scrap.deletedAt) return { ok: false, status: 404, error: "Recado não encontrado." };
  if (scrap.profileId !== user.id && scrap.authorId !== user.id && !user.canModerate) return { ok: false, status: 403, error: "Só quem recebeu ou quem escreveu pode apagar o recado." };
  await prisma.scrap.update({ where: { id: scrapId }, data: { deletedAt: new Date() } });
  return { ok: true };
}

// ---------- Depoimentos ----------

/** Aprovados para todos; a dona do perfil vê também os que esperam aprovação. */
export async function listTestimonials(profileId: string, viewerId: string | null) {
  const blocked = [...(await blockedUserIdSet(viewerId))];
  const own = viewerId === profileId;
  return prisma.testimonial.findMany({
    where: { profileId, status: own ? { in: ["APPROVED", "PENDING"] } : "APPROVED", ...(blocked.length ? { authorId: { notIn: blocked } } : {}) },
    orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
    include: { author: AUTHOR },
  });
}

/** Escrever (ou reescrever) o depoimento: só amigos; volta a esperar a aprovação de quem recebe. */
export async function writeTestimonial(profileId: string, authorId: string, input: unknown): Promise<{ ok: true } | ProfileError> {
  const body = clean((input as { body?: unknown } | null)?.body);
  if (isBlank(body) || body.length > TESTIMONIAL_MAX) return { ok: false, status: 400, error: `Depoimento de 1 a ${TESTIMONIAL_MAX.toLocaleString("pt-BR")} caracteres.` };
  const denied = await canInteract(authorId, profileId);
  if (denied) return denied;
  if (!(await areFriends(authorId, profileId))) return { ok: false, status: 403, error: "Só amigos escrevem depoimentos." };
  await prisma.testimonial.upsert({
    where: { profileId_authorId: { profileId, authorId } },
    create: { profileId, authorId, body },
    update: { body, status: "PENDING", decidedAt: null },
  });
  await notifySocial({ type: "PROFILE_TESTIMONIAL", recipientId: profileId, actorId: authorId });
  return { ok: true };
}

/** Aprovar ou recusar (só a dona do perfil). */
export async function decideTestimonial(testimonialId: string, ownerId: string, approve: boolean): Promise<{ ok: true } | ProfileError> {
  const t = await prisma.testimonial.findUnique({ where: { id: testimonialId }, select: { profileId: true } });
  if (!t) return { ok: false, status: 404, error: "Depoimento não encontrado." };
  if (t.profileId !== ownerId) return { ok: false, status: 403, error: "Só quem recebeu o depoimento decide." };
  await prisma.testimonial.update({ where: { id: testimonialId }, data: { status: approve ? "APPROVED" : "REJECTED", decidedAt: new Date() } });
  return { ok: true };
}

/** Apagar: quem escreveu ou quem recebeu. */
export async function deleteTestimonial(testimonialId: string, userId: string): Promise<{ ok: true } | ProfileError> {
  const t = await prisma.testimonial.findUnique({ where: { id: testimonialId }, select: { profileId: true, authorId: true } });
  if (!t) return { ok: false, status: 404, error: "Depoimento não encontrado." };
  if (t.profileId !== userId && t.authorId !== userId) return { ok: false, status: 403, error: "Só quem escreveu ou quem recebeu pode apagar." };
  await prisma.testimonial.delete({ where: { id: testimonialId } });
  return { ok: true };
}

// ---------- Fãs e avaliações ----------

/** Ser fã / deixar de ser (não de si mesmo). */
export async function setFan(fanId: string, targetId: string, fan: boolean): Promise<{ ok: true; fans: number } | ProfileError> {
  if (fanId === targetId) return { ok: false, status: 400, error: "Não dá para ser fã de si mesmo." };
  const denied = await canInteract(fanId, targetId);
  if (denied) return denied;
  if (fan) {
    await prisma.fan.upsert({ where: { fanId_targetId: { fanId, targetId } }, create: { fanId, targetId }, update: {} });
    await notifySocial({ type: "PROFILE_FAN", recipientId: targetId, actorId: fanId });
  } else {
    await prisma.fan.deleteMany({ where: { fanId, targetId } });
  }
  return { ok: true, fans: await prisma.fan.count({ where: { targetId } }) };
}

/** Avaliar um amigo (0 a 3 em cada); só amigos. */
export async function rate(raterId: string, targetId: string, input: unknown): Promise<{ ok: true } | ProfileError> {
  if (raterId === targetId) return { ok: false, status: 400, error: "Não dá para se avaliar." };
  const body = (input ?? {}) as Record<string, unknown>;
  const values: Partial<Record<RatingKey, number>> = {};
  for (const k of RATING_KEYS) {
    if (body[k] === undefined) continue;
    const v = body[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 3) return { ok: false, status: 400, error: "Cada avaliação vai de 0 a 3." };
    values[k] = v;
  }
  if (Object.keys(values).length === 0) return { ok: false, status: 400, error: "Nada para avaliar." };
  const denied = await canInteract(raterId, targetId);
  if (denied) return denied;
  if (!(await areFriends(raterId, targetId))) return { ok: false, status: 403, error: "Só amigos avaliam." };
  await prisma.profileRating.upsert({ where: { raterId_targetId: { raterId, targetId } }, create: { raterId, targetId, ...values }, update: values });
  return { ok: true };
}

/** Média de cada avaliação (0 a 3, arredondada para o ícone) e quantos avaliaram; e a avaliação de quem vê. */
export async function ratingSummary(targetId: string, viewerId: string | null) {
  const [agg, mine] = await Promise.all([
    prisma.profileRating.aggregate({ where: { targetId }, _avg: { otaku: true, gentil: true, semSpoiler: true }, _count: { _all: true } }),
    viewerId ? prisma.profileRating.findUnique({ where: { raterId_targetId: { raterId: viewerId, targetId } }, select: { otaku: true, gentil: true, semSpoiler: true } }) : Promise.resolve(null),
  ]);
  const avg = (k: RatingKey) => Math.round((agg._avg[k] ?? 0) * 10) / 10;
  return { votes: agg._count._all, average: { otaku: avg("otaku"), gentil: avg("gentil"), semSpoiler: avg("semSpoiler") }, mine };
}
