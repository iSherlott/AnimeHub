import { prisma } from "@/lib/prisma";
import { blockedUserIdSet, blockRelation } from "@/lib/blocks";

export type SocialNotificationType =
  | "POST_REPLY"
  | "COMMENT_REPLY"
  | "NEW_FOLLOWER"
  | "POST_LIKE"
  | "PROFILE_SCRAP"
  | "PROFILE_TESTIMONIAL"
  | "PROFILE_FAN"
  | "COMMUNITY_REPLY"
  | "COMMUNITY_EVENT"
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "FRIEND_BIRTHDAY";

/** Qual preferência da conta controla cada tipo (Configurações, S-12). */
const PREFERENCE_BY_TYPE = {
  POST_REPLY: "notifyReplies",
  COMMENT_REPLY: "notifyComments",
  NEW_FOLLOWER: "notifyFollowers",
  POST_LIKE: "notifyLikes",
  // Perfil social: recado e depoimento são comentários no perfil; virar fã é como ganhar um seguidor.
  PROFILE_SCRAP: "notifyComments",
  PROFILE_TESTIMONIAL: "notifyComments",
  PROFILE_FAN: "notifyFollowers",
  // Comunidades: resposta num tópico em que a pessoa participa e evento novo numa comunidade dela.
  COMMUNITY_REPLY: "notifyCommunity",
  COMMUNITY_EVENT: "notifyCommunity",
  // Amizade: como um seguidor novo.
  FRIEND_REQUEST: "notifyFollowers",
  FRIEND_ACCEPTED: "notifyFollowers",
  // Criado por src/lib/birthdays.ts (um por amigo por dia), não pelo notifySocial.
  FRIEND_BIRTHDAY: "notifyFollowers",
} as const;

/** Tipos que não se repetem: a mesma pessoa curtindo/seguindo de novo não gera outro aviso. */
const DEDUPED: ReadonlySet<SocialNotificationType> = new Set(["NEW_FOLLOWER", "POST_LIKE", "PROFILE_FAN"]);
/**
 * Tipos que não se repetem só enquanto o aviso anterior (da mesma pessoa) não foi lido: um pedido de amizade reenviado
 * depois de recusado, uma amizade refeita ou um depoimento reescrito voltam a avisar — mas reescrever o depoimento três
 * vezes seguidas não gera três avisos.
 */
const DEDUPED_WHILE_UNREAD: ReadonlySet<SocialNotificationType> = new Set(["FRIEND_REQUEST", "FRIEND_ACCEPTED", "PROFILE_TESTIMONIAL"]);

/**
 * Registra uma notificação social para `recipientId`. Nunca lança: o aviso
 * é secundário e não pode derrubar a ação principal (responder, seguir,
 * curtir). Não notifica a si mesmo, quando há bloqueio entre as duas
 * pessoas, nem quando a preferência do destinatário está desligada. Guarda
 * só quem/onde, nunca o texto (spoiler-safe).
 */
export async function notifySocial(input: {
  type: SocialNotificationType;
  recipientId: string;
  actorId: string;
  postId?: string | null;
  commentId?: string | null;
}): Promise<void> {
  try {
    const { type, recipientId, actorId } = input;
    if (recipientId === actorId) return;
    if ((await blockRelation(actorId, recipientId)) !== "none") return;

    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { notifyReplies: true, notifyComments: true, notifyFollowers: true, notifyLikes: true, notifyCommunity: true },
    });
    if (!recipient || !recipient[PREFERENCE_BY_TYPE[type]]) return;

    if (DEDUPED.has(type) || DEDUPED_WHILE_UNREAD.has(type)) {
      const existing = await prisma.socialNotification.findFirst({
        where: { userId: recipientId, actorId, type, postId: input.postId ?? null, ...(DEDUPED_WHILE_UNREAD.has(type) ? { readAt: null } : {}) },
        select: { id: true },
      });
      if (existing) return;
    }

    await prisma.socialNotification.create({
      data: { userId: recipientId, actorId, type, postId: input.postId ?? null, commentId: input.commentId ?? null },
    });
  } catch (error) {
    console.error("[notifySocial] falhou:", error);
  }
}

/** Máximo de destinatários de um aviso em grupo (evento numa comunidade grande, tópico muito movimentado). */
const MAX_RECIPIENTS = 1000;

/**
 * Aviso das comunidades para várias pessoas de uma vez. Mesmas regras do `notifySocial` (nem para si, nem com bloqueio,
 * respeita a preferência). Respostas num tópico não se acumulam: enquanto o aviso daquele tópico não foi lido, ele só
 * é atualizado (quem respondeu por último, a resposta e a hora), em vez de criar outro.
 */
export async function notifyCommunity(
  input: ({ type: "COMMUNITY_REPLY"; topicId: string; replyId: string } | { type: "COMMUNITY_EVENT"; eventId: string }) & { actorId: string; recipientIds: string[]; communityId: string }
): Promise<void> {
  try {
    const { type, actorId } = input;
    const blocked = await blockedUserIdSet(actorId);
    const candidates = [...new Set(input.recipientIds)].filter((id) => id !== actorId && !blocked.has(id)).slice(0, MAX_RECIPIENTS);
    if (candidates.length === 0) return;
    // Só quem ainda é membro (quem saiu da comunidade deixa de receber avisos dela) e quer os avisos.
    const recipients = (await prisma.user.findMany({ where: { id: { in: candidates }, notifyCommunity: true, communityMemberships: { some: { communityId: input.communityId } } }, select: { id: true } })).map((u) => u.id);
    if (recipients.length === 0) return;
    const now = new Date();

    if (input.type === "COMMUNITY_REPLY") {
      const unread = await prisma.socialNotification.findMany({ where: { userId: { in: recipients }, type, topicId: input.topicId, readAt: null }, select: { id: true, userId: true } });
      if (unread.length) await prisma.socialNotification.updateMany({ where: { id: { in: unread.map((n) => n.id) } }, data: { actorId, replyId: input.replyId, createdAt: now } });
      const already = new Set(unread.map((n) => n.userId));
      const fresh = recipients.filter((id) => !already.has(id));
      if (fresh.length) await prisma.socialNotification.createMany({ data: fresh.map((userId) => ({ userId, actorId, type, topicId: input.topicId, replyId: input.replyId, createdAt: now })) });
    } else {
      await prisma.socialNotification.createMany({ data: recipients.map((userId) => ({ userId, actorId, type, eventId: input.eventId, createdAt: now })) });
    }
  } catch (error) {
    console.error("[notifyCommunity] falhou:", error);
  }
}
