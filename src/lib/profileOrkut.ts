import { prisma } from "@/lib/prisma";
import { blockedUserIdSet, blockRelation } from "@/lib/blocks";
import { isBlank } from "@/lib/text";
import { notifySocial } from "@/lib/socialNotifications";
import { areFriends, listFriends } from "@/lib/friends";
import { isReportReason, REPORT_REASON_LABELS } from "@/lib/reportReasons";

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

/**
 * Quem não aparece no perfil para quem vê: quem tem bloqueio com quem vê e quem tem bloqueio com a dona do perfil (o
 * que a pessoa bloqueada escreveu some do perfil para todos, não só para a dona).
 */
async function hiddenAuthors(profileId: string, viewerId: string | null): Promise<string[]> {
  const [mine, owner] = await Promise.all([blockedUserIdSet(viewerId), blockedUserIdSet(profileId)]);
  return [...new Set([...mine, ...owner])];
}

// ---------- Recados ----------

export async function listScraps(profileId: string, page: number, viewerId: string | null, take = SCRAPS_PAGE) {
  const blocked = await hiddenAuthors(profileId, viewerId);
  const where = { profileId, deletedAt: null, ...(blocked.length ? { authorId: { notIn: blocked } } : {}) };
  const [total, rows] = await Promise.all([prisma.scrap.count({ where }), prisma.scrap.findMany({ where, orderBy: { createdAt: "desc" }, skip: page * take, take, include: { author: AUTHOR, replyTo: { select: { id: true, deletedAt: true } } } })]);
  return { total, rows };
}

/**
 * Deixar um recado. Com `replyToId`, é a resposta a um recado que a pessoa recebeu: vai para o perfil de quem escreveu
 * o original (só quem recebeu responde, e só para quem escreveu).
 */
export async function createScrap(profileId: string, authorId: string, input: unknown): Promise<{ ok: true; id: string } | ProfileError> {
  const raw = (input ?? {}) as { body?: unknown; replyToId?: unknown };
  const body = clean(raw.body);
  if (isBlank(body) || body.length > SCRAP_MAX) return { ok: false, status: 400, error: `Recado de 1 a ${SCRAP_MAX.toLocaleString("pt-BR")} caracteres.` };
  const denied = await canInteract(authorId, profileId);
  if (denied) return denied;
  let replyToId: string | null = null;
  if (raw.replyToId !== undefined && raw.replyToId !== null) {
    const original = typeof raw.replyToId === "string" ? await prisma.scrap.findFirst({ where: { id: raw.replyToId, deletedAt: null }, select: { id: true, profileId: true, authorId: true } }) : null;
    if (!original || original.profileId !== authorId || original.authorId !== profileId) return { ok: false, status: 400, error: "Só dá para responder um recado que você recebeu, no perfil de quem o escreveu." };
    replyToId = original.id;
  }
  const scrap = await prisma.scrap.create({ data: { profileId, authorId, body, replyToId }, select: { id: true } });
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

/**
 * A conversa entre duas pessoas: os recados de uma no perfil da outra, nos dois sentidos, do mais antigo ao mais novo
 * (os 100 mais recentes). Nulo se alguma das duas não existe ou se quem vê tem bloqueio com uma delas.
 */
export async function scrapConversation(aId: string, bId: string, viewerId: string | null) {
  if (aId === bId) return null;
  const people = await prisma.user.findMany({ where: { id: { in: [aId, bId] } }, select: { id: true, displayName: true, handle: true, avatarUrl: true } });
  if (people.length !== 2) return null;
  const blocked = await blockedUserIdSet(viewerId);
  if (blocked.has(aId) || blocked.has(bId) || (await blockRelation(aId, bId)) !== "none") return null;
  const rows = await prisma.scrap.findMany({
    where: { deletedAt: null, OR: [{ profileId: aId, authorId: bId }, { profileId: bId, authorId: aId }] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { author: AUTHOR, replyTo: { select: { id: true, deletedAt: true } } },
  });
  const byId = new Map(people.map((p) => [p.id, p]));
  return { a: byId.get(aId)!, b: byId.get(bId)!, scraps: rows.reverse() };
}

// ---------- Depoimentos ----------

/** Aprovados para todos; a dona do perfil vê também os que esperam aprovação. */
export async function listTestimonials(profileId: string, viewerId: string | null) {
  const blocked = await hiddenAuthors(profileId, viewerId);
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
  // Depoimento removido pela moderação não volta reescrito (seria um jeito de contornar a decisão).
  const existing = await prisma.testimonial.findUnique({ where: { profileId_authorId: { profileId, authorId } }, select: { status: true } });
  if (existing?.status === "REMOVED") return { ok: false, status: 403, error: "Este depoimento foi removido pela moderação e não pode ser reescrito." };
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
  return { ok: true, fans: (await listFans(targetId, fanId, 0)).total };
}

/** Fãs da pessoa (os mais recentes primeiro), sem quem tem bloqueio com quem vê ou com a dona do perfil. */
export async function listFans(targetId: string, viewerId: string | null, take = 60) {
  const blocked = await hiddenAuthors(targetId, viewerId);
  const where = { targetId, ...(blocked.length ? { fanId: { notIn: blocked } } : {}) };
  const [total, rows] = await Promise.all([prisma.fan.count({ where }), prisma.fan.findMany({ where, orderBy: { createdAt: "desc" }, take, include: { fan: AUTHOR } })]);
  return { total, rows: rows.map((r) => r.fan) };
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

/**
 * Média de cada avaliação (0 a 3, arredondada para o ícone) e quantos avaliaram; e a avaliação de quem vê. Só contam
 * as notas de quem AINDA é amigo (a regra é "só amigos avaliam": a nota de quem desfez a amizade ou foi bloqueado fica
 * guardada, mas sai da média).
 */
export async function ratingSummary(targetId: string, viewerId: string | null) {
  const friendIds = (await listFriends(targetId, null, 10_000)).rows.map((f) => f.id);
  const [agg, mine] = await Promise.all([
    prisma.profileRating.aggregate({ where: { targetId, raterId: { in: friendIds } }, _avg: { otaku: true, gentil: true, semSpoiler: true }, _count: { _all: true } }),
    viewerId ? prisma.profileRating.findUnique({ where: { raterId_targetId: { raterId: viewerId, targetId } }, select: { otaku: true, gentil: true, semSpoiler: true } }) : Promise.resolve(null),
  ]);
  const avg = (k: RatingKey) => Math.round((agg._avg[k] ?? 0) * 10) / 10;
  return { votes: agg._count._all, average: { otaku: avg("otaku"), gentil: avg("gentil"), semSpoiler: avg("semSpoiler") }, mine };
}

// ---------- Moderação (denúncias de recados e depoimentos) ----------

export type ProfileContentKind = "scrap" | "testimonial";

/**
 * Denunciar um recado ou um depoimento aprovado, com um dos motivos fixos. Quem escreveu não denuncia o próprio. Uma
 * denúncia aberta por pessoa e conteúdo (repetir não duplica). Vai para Admin → Acesso e moderação.
 */
export async function reportProfileContent(reporterId: string, kind: ProfileContentKind, contentId: string, reason: unknown): Promise<{ ok: true } | ProfileError> {
  if (!isReportReason(reason)) return { ok: false, status: 400, error: "Escolha o motivo da denúncia." };
  const content =
    kind === "scrap"
      ? await prisma.scrap.findFirst({ where: { id: contentId, deletedAt: null }, select: { authorId: true } })
      : await prisma.testimonial.findFirst({ where: { id: contentId, status: "APPROVED" }, select: { authorId: true } });
  if (!content) return { ok: false, status: 404, error: kind === "scrap" ? "Recado não encontrado." : "Depoimento não encontrado." };
  if (content.authorId === reporterId) return { ok: false, status: 400, error: "Não dá para denunciar o que você mesmo escreveu." };
  const ref = kind === "scrap" ? { scrapId: contentId } : { testimonialId: contentId };
  const open = await prisma.profileReport.findFirst({ where: { reporterId, ...ref, resolvedAt: null }, select: { id: true } });
  if (!open) await prisma.profileReport.create({ data: { reporterId, ...ref, reason } });
  return { ok: true };
}

/** Fila das denúncias abertas (as mais antigas primeiro), com o conteúdo, quem escreveu, em que perfil e o motivo. */
export async function openProfileReports() {
  const person = { select: { id: true, displayName: true } } as const;
  const rows = await prisma.profileReport.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      reporter: person,
      scrap: { select: { id: true, body: true, deletedAt: true, author: person, profile: person } },
      testimonial: { select: { id: true, body: true, status: true, author: person, profile: person } },
    },
  });
  return rows.flatMap((r) => {
    const c = r.scrap ?? r.testimonial;
    if (!c) return [];
    const kind: ProfileContentKind = r.scrap ? "scrap" : "testimonial";
    return [
      {
        id: r.id,
        kind,
        reason: isReportReason(r.reason) ? REPORT_REASON_LABELS[r.reason] : r.reason,
        reporter: r.reporter.displayName,
        author: c.author.displayName,
        profile: c.profile.displayName,
        body: c.body,
        removed: r.scrap ? r.scrap.deletedAt !== null : r.testimonial?.status === "REMOVED",
        href: `/users/${c.profile.id}#${kind === "scrap" ? "recados" : "depoimentos"}`,
      },
    ];
  });
}

/** Resolver (moderação): remover esconde o recado/depoimento; as denúncias abertas do mesmo conteúdo fecham juntas. */
export async function resolveProfileReport(reportId: string, action: "remove" | "keep", moderatorId: string): Promise<{ ok: true } | ProfileError> {
  const r = await prisma.profileReport.findUnique({ where: { id: reportId }, select: { scrapId: true, testimonialId: true, resolvedAt: true } });
  if (!r) return { ok: false, status: 404, error: "Denúncia não encontrada." };
  if (r.resolvedAt) return { ok: false, status: 409, error: "Denúncia já resolvida." };
  const now = new Date();
  if (action === "remove") {
    if (r.scrapId) await prisma.scrap.updateMany({ where: { id: r.scrapId, deletedAt: null }, data: { deletedAt: now } });
    if (r.testimonialId) await prisma.testimonial.update({ where: { id: r.testimonialId }, data: { status: "REMOVED", decidedAt: now } });
  }
  await prisma.profileReport.updateMany({
    where: { resolvedAt: null, ...(r.scrapId ? { scrapId: r.scrapId } : { testimonialId: r.testimonialId }) },
    data: { resolvedAt: now, resolvedById: moderatorId, action: action === "remove" ? "REMOVED" : "KEPT" },
  });
  return { ok: true };
}
