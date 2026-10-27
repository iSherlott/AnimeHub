import { prisma } from "@/lib/prisma";
import { blockedUserIdSet, blockRelation } from "@/lib/blocks";
import { notifySocial } from "@/lib/socialNotifications";
import { NEWSHUB_EMAIL } from "@/lib/newsHub";

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
    // Amigo novo pode fazer aniversário hoje: os aniversários do dia voltam a ser calculados para os dois.
    prisma.user.updateMany({ where: { id: { in: [fromId, toId] } }, data: { birthdayCheckedOn: null } }),
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

// ---------- Encontrar pessoas ----------

export type PersonCard = { id: string; displayName: string; handle: string | null; avatarUrl: string | null; state: Exclude<FriendState, "self">; detail: string | null };

/** Quem não entra em busca nem sugestão: a própria pessoa, quem tem bloqueio com ela e a conta do sistema (NewsHub). */
async function excludedIds(viewerId: string): Promise<string[]> {
  const [blocked, system] = await Promise.all([blockedUserIdSet(viewerId), prisma.user.findUnique({ where: { email: NEWSHUB_EMAIL }, select: { id: true } })]);
  return [viewerId, ...blocked, ...(system ? [system.id] : [])];
}

/** A relação de quem vê com cada pessoa da lista (amizade e pedidos), numa consulta por tipo. */
async function statesFor(viewerId: string, ids: string[]): Promise<Map<string, Exclude<FriendState, "self">>> {
  const [friendships, sent, received] = await Promise.all([
    prisma.friendship.findMany({ where: { OR: [{ userAId: viewerId, userBId: { in: ids } }, { userBId: viewerId, userAId: { in: ids } }] }, select: { userAId: true, userBId: true } }),
    prisma.friendRequest.findMany({ where: { fromId: viewerId, toId: { in: ids } }, select: { toId: true } }),
    prisma.friendRequest.findMany({ where: { toId: viewerId, fromId: { in: ids } }, select: { fromId: true } }),
  ]);
  const out = new Map<string, Exclude<FriendState, "self">>(ids.map((id) => [id, "none"]));
  for (const r of received) out.set(r.fromId, "received");
  for (const r of sent) out.set(r.toId, "sent");
  for (const f of friendships) out.set(f.userAId === viewerId ? f.userBId : f.userAId, "friends");
  return out;
}

/** Busca por nome ou @identificador (sem a própria pessoa, bloqueios e a conta do sistema), com a relação de cada uma. */
export async function searchPeople(viewerId: string, query: string, take = 20): Promise<PersonCard[]> {
  const q = query.trim().replace(/^@/, "");
  if (q.length < 2) return [];
  const rows = await prisma.user.findMany({
    where: { id: { notIn: await excludedIds(viewerId) }, OR: [{ displayName: { contains: q, mode: "insensitive" } }, { handle: { contains: q.toLowerCase() } }] },
    select: { id: true, displayName: true, handle: true, avatarUrl: true },
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    take,
  });
  const states = await statesFor(viewerId, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, state: states.get(r.id) ?? "none", detail: null }));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Sugestões de amizade: quem participa das mesmas comunidades (vale 2) e quem acompanha os mesmos animes (vale 1; só
 * conta quem deixa a aba Animes pública, para não revelar listas ocultas). Ficam de fora amigos, pedidos pendentes,
 * bloqueios e a conta do sistema. O motivo vai junto ("2 comunidades em comum · 3 animes em comum").
 */
export async function friendSuggestions(viewerId: string, take = 8): Promise<PersonCard[]> {
  const [communities, works, friendships, requests, excluded] = await Promise.all([
    prisma.communityMember.findMany({ where: { userId: viewerId }, select: { communityId: true } }),
    prisma.anime.findMany({ where: { userId: viewerId }, select: { anilistId: true, catalogEntryId: true } }),
    prisma.friendship.findMany({ where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] }, select: { userAId: true, userBId: true } }),
    prisma.friendRequest.findMany({ where: { OR: [{ fromId: viewerId }, { toId: viewerId }] }, select: { fromId: true, toId: true } }),
    excludedIds(viewerId),
  ]);
  const skip = new Set([...excluded, ...friendships.flatMap((f) => [f.userAId, f.userBId]), ...requests.flatMap((r) => [r.fromId, r.toId])]);
  const anilistIds = works.flatMap((w) => (w.anilistId !== null ? [w.anilistId] : []));
  const entryIds = works.flatMap((w) => (w.anilistId === null && w.catalogEntryId ? [w.catalogEntryId] : []));
  const [coMembers, coTrackers] = await Promise.all([
    communities.length ? prisma.communityMember.groupBy({ by: ["userId"], where: { communityId: { in: communities.map((c) => c.communityId) }, userId: { notIn: [...skip] } }, _count: { _all: true } }) : [],
    works.length
      ? prisma.anime.groupBy({
          by: ["userId"],
          where: { userId: { notIn: [...skip] }, user: { animeListPublic: true }, OR: [...(anilistIds.length ? [{ anilistId: { in: anilistIds } }] : []), ...(entryIds.length ? [{ anilistId: null, catalogEntryId: { in: entryIds } }] : [])] },
          _count: { _all: true },
        })
      : [],
  ]);
  const score = new Map<string, { communities: number; works: number }>();
  for (const m of coMembers) score.set(m.userId, { communities: m._count._all, works: 0 });
  for (const t of coTrackers) {
    if (!t.userId) continue;
    const cur = score.get(t.userId) ?? { communities: 0, works: 0 };
    score.set(t.userId, { ...cur, works: t._count._all });
  }
  const ranked = [...score.entries()].sort((a, b) => b[1].communities * 2 + b[1].works - (a[1].communities * 2 + a[1].works) || a[0].localeCompare(b[0])).slice(0, take);
  if (ranked.length === 0) return [];
  const people = new Map((await prisma.user.findMany({ where: { id: { in: ranked.map(([id]) => id) } }, select: { id: true, displayName: true, handle: true, avatarUrl: true } })).map((u) => [u.id, u]));
  return ranked.flatMap(([id, s]) => {
    const person = people.get(id);
    if (!person) return [];
    const detail = [s.communities ? plural(s.communities, "comunidade em comum", "comunidades em comum") : null, s.works ? plural(s.works, "anime em comum", "animes em comum") : null].filter(Boolean).join(" · ");
    return [{ ...person, state: "none" as const, detail }];
  });
}
