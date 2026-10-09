import { prisma } from "@/lib/prisma";
import { blockRelation } from "@/lib/blocks";

export type SocialNotificationType = "POST_REPLY" | "COMMENT_REPLY" | "NEW_FOLLOWER" | "POST_LIKE";

/** Qual preferência da conta controla cada tipo (Configurações, S-12). */
const PREFERENCE_BY_TYPE = {
  POST_REPLY: "notifyReplies",
  COMMENT_REPLY: "notifyComments",
  NEW_FOLLOWER: "notifyFollowers",
  POST_LIKE: "notifyLikes",
} as const;

/** Tipos que não se repetem: a mesma pessoa curtindo/seguindo de novo não gera outro aviso. */
const DEDUPED: ReadonlySet<SocialNotificationType> = new Set(["NEW_FOLLOWER", "POST_LIKE"]);

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
      select: { notifyReplies: true, notifyComments: true, notifyFollowers: true, notifyLikes: true },
    });
    if (!recipient || !recipient[PREFERENCE_BY_TYPE[type]]) return;

    if (DEDUPED.has(type)) {
      const existing = await prisma.socialNotification.findFirst({
        where: { userId: recipientId, actorId, type, postId: input.postId ?? null },
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
