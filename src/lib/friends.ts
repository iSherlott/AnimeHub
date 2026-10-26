import { prisma } from "@/lib/prisma";
import { blockedUserIdSet, blockRelation } from "@/lib/blocks";
import { notifySocial } from "@/lib/socialNotifications";

/**
 * Amizade como no Orkut, separada do seguir: alguém pede, a outra pessoa aceita ou recusa. Depoimentos e avaliações do
 * perfil exigem amizade. Seguir continua independente (é o que monta o "Seguindo" do Feed). Bloqueio desfaz a amizade
 * e os pedidos, e impede pedidos novos.
 */
export type FriendState = "self" | "none" | "friends" | "sent" | "received";
export type FriendError = { ok: false; status: 400 | 403 | 404 | 409; error: string };

const PERSON = { select: { id: true, displayName: true, handle: true, avatarUrl: true } } as const;

/** O par na ordem gravada (menor id primeiro, ordem binária — a mesma da migração). */
export function friendPair(a: string, b: string): { userAId: string; userBId: string } {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  return (await prisma.friendship.findUnique({ where: { userAId_userBId: friendPair(a, b) }, select: { createdAt: true } })) !== null;
}

/** A relação de quem vê com outra pessoa. */
export async function friendState(viewerId: string, otherId: string): Promise<FriendState> {
  if (viewerId === otherId) return "self";
  const [friends, sent, received] = await Promise.all([
    areFriends(viewerId, otherId),
    prisma.friendRequest.findUnique({ where: { fromId_toId: { fromId: viewerId, toId: otherId } }, select: { createdAt: true } }),
    prisma.friendRequest.findUnique({ where: { fromId_toId: { fromId: otherId, toId: viewerId } }, select: { createdAt: true } }),
  ]);
  return friends ? "friends" : sent ? "sent" : received ? "received" : "none";
}

async function accept(fromId: string, toId: string): Promise<void> {
  await prisma.$transaction([
    prisma.friendship.upsert({ where: { userAId_userBId: friendPair(fromId, toId) }, create: friendPair(fromId, toId), update: {} }),
    prisma.friendRequest.deleteMany({ where: { OR: [{ fromId, toId }, { fromId: toId, toId: fromId }] } }),
  ]);
  await notifySocial({ type: "FRIEND_ACCEPTED", recipientId: fromId, actorId: toId });
}

/**
 * "Adicionar como amigo". Se a outra pessoa já tinha pedido, é aceitar o pedido dela. Não vale para si mesmo, com
 * bloqueio entre as duas ou quando já são amigas.
 */
export async function addFriend(viewerId: string, otherId: string): Promise<{ ok: true; state: FriendState } | FriendError> {
  if (viewerId === otherId) return { ok: false, status: 400, error: "Não dá para adicionar a si mesmo." };
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true } });
  if (!other || (await blockRelation(viewerId, otherId)) !== "none") return { ok: false, status: 404, error: "Perfil indisponível." };
  const state = await friendState(viewerId, otherId);
  if (state === "friends") return { ok: false, status: 409, error: "Vocês já são amigos." };
  if (state === "received") {
    await accept(otherId, viewerId);
    return { ok: true, state: "friends" };
  }
  if (state === "none") {
    await prisma.friendRequest.create({ data: { fromId: viewerId, toId: otherId } });
    await notifySocial({ type: "FRIEND_REQUEST", recipientId: otherId, actorId: viewerId });
  }
  return { ok: true, state: "sent" };
}

/** Desfaz o que houver: cancela o pedido enviado, recusa o recebido ou desfaz a amizade. */
export async function removeFriend(viewerId: string, otherId: string): Promise<{ ok: true; state: FriendState } | FriendError> {
  if (viewerId === otherId) return { ok: false, status: 400, error: "Não dá para desfazer amizade consigo mesmo." };
  await prisma.$transaction([
    prisma.friendship.deleteMany({ where: friendPair(viewerId, otherId) }),
    prisma.friendRequest.deleteMany({ where: { OR: [{ fromId: viewerId, toId: otherId }, { fromId: otherId, toId: viewerId }] } }),
  ]);
  return { ok: true, state: "none" };
}

/** Chamado ao bloquear: a amizade e os pedidos entre as duas pessoas somem. */
export function endFriendshipOps(a: string, b: string) {
  return [
    prisma.friendship.deleteMany({ where: friendPair(a, b) }),
    prisma.friendRequest.deleteMany({ where: { OR: [{ fromId: a, toId: b }, { fromId: b, toId: a }] } }),
  ];
}

/** Amigos da pessoa, dos mais recentes aos mais antigos; sem quem o visitante bloqueou (ou que o bloqueou). */
export async function listFriends(userId: string, viewerId: string | null, take = 9) {
  const blocked = [...(await blockedUserIdSet(viewerId))];
  const notBlocked = blocked.length ? { notIn: blocked } : undefined;
  const where = { OR: [{ userAId: userId, ...(notBlocked ? { userBId: notBlocked } : {}) }, { userBId: userId, ...(notBlocked ? { userAId: notBlocked } : {}) }] };
  const [total, rows] = await Promise.all([
    prisma.friendship.count({ where }),
    prisma.friendship.findMany({ where, orderBy: { createdAt: "desc" }, take, include: { userA: PERSON, userB: PERSON } }),
  ]);
  return { total, rows: rows.map((r) => (r.userAId === userId ? r.userB : r.userA)) };
}

/** Pedidos recebidos e enviados (a página "Amigos"), sem quem tem bloqueio com a pessoa. */
export async function friendRequests(userId: string) {
  const blocked = [...(await blockedUserIdSet(userId))];
  const [received, sent] = await Promise.all([
    prisma.friendRequest.findMany({ where: { toId: userId, ...(blocked.length ? { fromId: { notIn: blocked } } : {}) }, orderBy: { createdAt: "desc" }, include: { from: PERSON } }),
    prisma.friendRequest.findMany({ where: { fromId: userId, ...(blocked.length ? { toId: { notIn: blocked } } : {}) }, orderBy: { createdAt: "desc" }, include: { to: PERSON } }),
  ]);
  return { received: received.map((r) => ({ ...r.from, at: r.createdAt })), sent: sent.map((r) => ({ ...r.to, at: r.createdAt })) };
}

export async function pendingReceivedCount(userId: string): Promise<number> {
  return prisma.friendRequest.count({ where: { toId: userId } });
}
