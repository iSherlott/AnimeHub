import type { CatalogEntry, Community, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { blockedUserIdSet } from "@/lib/blocks";
import { notifyCommunity } from "@/lib/socialNotifications";
import { isBlank } from "@/lib/text";
import { resolveWorkKey } from "@/lib/workRef";
import { catalogSlug } from "@/lib/workHref";

/**
 * Comunidades: o fórum de cada anime. Uma comunidade por franquia do catálogo (`franchiseKey`, Epic 45:
 * temporadas, OVAs e filmes juntos); obra sem franquia (só do AniDB/Kitsu) tem a dela. Ler é público; criar tópico,
 * responder e votar exige entrar na comunidade. Ela só é criada na primeira participação.
 *
 * A chave da franquia é o menor AniList ID do grupo e pode mudar quando uma obra mais antiga entra nele. Por isso a
 * comunidade é achada por QUALQUER obra da franquia; se duas comunidades acabarem na mesma franquia (grupos que se
 * juntaram, obra do AniDB ligada à AniList), elas viram uma só, com tópicos e membros somados.
 */
export const LIMITS = { title: 120, body: 5000, reply: 3000, pollOption: 80, pollMin: 2, pollMax: 10 } as const;
export const TOPICS_PAGE = 20;
export const REPLIES_PAGE = 30;

type Db = Prisma.TransactionClient | typeof prisma;

export type CommunityWork = { id: string; anilistId: number | null; titleRomaji: string; titleNative: string | null; titleEnglish: string | null; kind: string | null; format: string | null; seasonYear: number | null };

/** Do que é a comunidade: a franquia (ou a obra), com as obras dela. */
export type CommunityScope = {
  /** Chave do endereço `/comunidades/<key>`: a da franquia ou, sem franquia, a da obra (`anidb-<id>`). */
  key: string;
  franchiseKey: number | null;
  catalogEntryId: string | null;
  /** A obra que dá nome e capa à comunidade (a raiz da franquia). */
  root: { titleRomaji: string; titleNative: string | null; titleEnglish: string | null; coverImage: string | null; bannerImage: string | null; workKey: string };
  works: CommunityWork[];
};

const WORK_SELECT = { id: true, anilistId: true, anidbId: true, kitsuId: true, titleRomaji: true, titleNative: true, titleEnglish: true, coverImage: true, bannerImage: true, kind: true, format: true, seasonYear: true, timelineOrder: true, franchiseKey: true } as const;
type WorkRow = Pick<CatalogEntry, keyof typeof WORK_SELECT>;

const workKeyOf = (w: Pick<WorkRow, "anilistId" | "anidbId" | "kitsuId">) => (w.anilistId !== null ? String(w.anilistId) : (catalogSlug(w) ?? ""));
const toWork = (w: WorkRow): CommunityWork => ({ id: w.id, anilistId: w.anilistId, titleRomaji: w.titleRomaji, titleNative: w.titleNative, titleEnglish: w.titleEnglish, kind: w.kind, format: w.format, seasonYear: w.seasonYear });

function scopeOf(entry: WorkRow, works: WorkRow[]): CommunityScope {
  const root = works.find((w) => entry.franchiseKey !== null && w.anilistId === entry.franchiseKey) ?? works[0] ?? entry;
  return {
    key: entry.franchiseKey !== null ? String(entry.franchiseKey) : workKeyOf(entry),
    franchiseKey: entry.franchiseKey,
    catalogEntryId: entry.franchiseKey !== null ? null : entry.id,
    root: { titleRomaji: root.titleRomaji, titleNative: root.titleNative, titleEnglish: root.titleEnglish, coverImage: root.coverImage, bannerImage: root.bannerImage, workKey: workKeyOf(root) },
    works: works.map(toWork),
  };
}

/** A comunidade de uma obra, pela chave de endereço dela (AniList ID ou `anidb-<id>`/`kitsu-<id>`). */
export async function scopeForKey(key: string): Promise<CommunityScope | null> {
  const work = await resolveWorkKey(key);
  if (!work) return null;
  const entry = await prisma.catalogEntry.findUnique({ where: work.anilistId !== null ? { anilistId: work.anilistId } : { id: work.catalogEntryId }, select: WORK_SELECT });
  if (!entry) return null;
  const works =
    entry.franchiseKey !== null
      ? await prisma.catalogEntry.findMany({ where: { franchiseKey: entry.franchiseKey, OR: [{ onPlatform: true }, { id: entry.id }] }, orderBy: [{ timelineOrder: { sort: "asc", nulls: "last" } }, { seasonYear: { sort: "asc", nulls: "last" } }, { titleRomaji: "asc" }], select: WORK_SELECT })
      : [entry];
  return scopeOf(entry, works);
}

/** A comunidade de uma comunidade já gravada (para "Minhas comunidades" e links). */
async function scopeOfCommunity(community: Pick<Community, "franchiseKey" | "catalogEntryId">): Promise<CommunityScope | null> {
  if (community.franchiseKey !== null) return scopeForKey(String(community.franchiseKey));
  if (!community.catalogEntryId) return null;
  const entry = await prisma.catalogEntry.findUnique({ where: { id: community.catalogEntryId }, select: WORK_SELECT });
  return entry ? scopeForKey(workKeyOf(entry)) : null;
}

/**
 * A comunidade gravada desta franquia (ou obra). Acha por qualquer obra do grupo, reajusta a chave e junta duplicatas:
 * a mais antiga fica, e as outras entregam tópicos e membros a ela. Com `create`, cria se ainda não existe.
 */
export async function findCommunity(scope: CommunityScope, options: { create?: boolean } = {}): Promise<Community | null> {
  return prisma.$transaction(async (tx) => {
    const anilistIds = scope.works.flatMap((w) => (w.anilistId !== null ? [w.anilistId] : []));
    const entryIds = scope.works.map((w) => w.id);
    const found = await tx.community.findMany({
      where: { OR: [...(scope.franchiseKey !== null ? [{ franchiseKey: { in: [scope.franchiseKey, ...anilistIds] } }] : []), { catalogEntryId: { in: entryIds } }] },
      orderBy: { createdAt: "asc" },
    });
    const wanted = scope.franchiseKey !== null ? { franchiseKey: scope.franchiseKey, catalogEntryId: null } : { franchiseKey: null, catalogEntryId: scope.catalogEntryId };
    if (found.length === 0) return options.create ? tx.community.create({ data: wanted }) : null;
    const [keeper, ...others] = found;
    for (const other of others) await mergeInto(tx, other.id, keeper.id);
    if (keeper.franchiseKey !== wanted.franchiseKey || keeper.catalogEntryId !== wanted.catalogEntryId) return tx.community.update({ where: { id: keeper.id }, data: wanted });
    return keeper;
  });
}

/** Junta uma comunidade em outra: tópicos mudam de comunidade; membros somam (vale a entrada mais antiga). */
export async function mergeInto(db: Db, fromId: string, toId: string): Promise<void> {
  await db.communityTopic.updateMany({ where: { communityId: fromId }, data: { communityId: toId } });
  for (const m of await db.communityMember.findMany({ where: { communityId: fromId } })) {
    const twin = await db.communityMember.findUnique({ where: { communityId_userId: { communityId: toId, userId: m.userId } } });
    if (!twin) await db.communityMember.create({ data: { communityId: toId, userId: m.userId, joinedAt: m.joinedAt, lastVisitAt: m.lastVisitAt } });
    else if (m.joinedAt < twin.joinedAt) await db.communityMember.update({ where: { communityId_userId: { communityId: toId, userId: m.userId } }, data: { joinedAt: m.joinedAt } });
  }
  await db.community.delete({ where: { id: fromId } });
}

/**
 * Junção AniDB → AniList: a comunidade da obra do AniDB passa para a obra de destino (ou se junta à dela). Quando a obra
 * de destino ganha franquia, a busca acha a comunidade por ela e a reajusta para a da franquia.
 */
export async function moveCatalogCommunity(fromId: string, toId: string, db: Db = prisma): Promise<void> {
  const community = await db.community.findUnique({ where: { catalogEntryId: fromId }, select: { id: true } });
  if (!community) return;
  const twin = await db.community.findUnique({ where: { catalogEntryId: toId }, select: { id: true } });
  if (twin) await mergeInto(db, community.id, twin.id);
  else await db.community.update({ where: { id: community.id }, data: { catalogEntryId: toId } });
}

// ---------- Membros ----------

export async function isMember(communityId: string | null, userId: string | null): Promise<boolean> {
  if (!communityId || !userId) return false;
  return Boolean(await prisma.communityMember.findUnique({ where: { communityId_userId: { communityId, userId } }, select: { userId: true } }));
}

/** Entrar na comunidade (cria a comunidade na primeira vez). Idempotente. */
export async function join(scope: CommunityScope, userId: string): Promise<Community> {
  const community = (await findCommunity(scope, { create: true })) as Community;
  await prisma.communityMember.upsert({ where: { communityId_userId: { communityId: community.id, userId } }, create: { communityId: community.id, userId }, update: {} });
  return community;
}

/** Sair: os tópicos e respostas da pessoa ficam. */
export async function leave(scope: CommunityScope, userId: string): Promise<void> {
  const community = await findCommunity(scope);
  if (community) await prisma.communityMember.deleteMany({ where: { communityId: community.id, userId } });
}

/** Marca a visita (o que teve atividade antes disto deixa de aparecer como novo). */
export async function markVisit(communityId: string, userId: string): Promise<void> {
  await prisma.communityMember.updateMany({ where: { communityId, userId }, data: { lastVisitAt: new Date() } });
}

// ---------- Tópicos e respostas ----------

export type CommunityError = { ok: false; status: 400 | 403 | 404 | 409; error: string; errors?: Record<string, string> };

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function validateTopic(input: unknown, works: CommunityWork[]): { ok: true; value: { title: string; body: string; isSpoiler: boolean; catalogEntryId: string | null; poll: string[] | null } } | { ok: false; errors: Record<string, string> } {
  const body = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const title = clean(body.title);
  const text = clean(body.body);
  if (isBlank(title)) errors.title = "dê um título ao tópico";
  else if (title.length > LIMITS.title) errors.title = `até ${LIMITS.title} caracteres`;
  if (isBlank(text)) errors.body = "escreva a mensagem do tópico";
  else if (text.length > LIMITS.body) errors.body = `até ${LIMITS.body.toLocaleString("pt-BR")} caracteres`;
  let catalogEntryId: string | null = null;
  if (body.catalogEntryId !== undefined && body.catalogEntryId !== null && body.catalogEntryId !== "") {
    if (typeof body.catalogEntryId === "string" && works.some((w) => w.id === body.catalogEntryId)) catalogEntryId = body.catalogEntryId;
    else errors.catalogEntryId = "escolha uma obra desta franquia";
  }
  let poll: string[] | null = null;
  if (body.poll !== undefined && body.poll !== null) {
    const options = Array.isArray(body.poll) ? body.poll.map(clean).filter((o) => !isBlank(o)) : [];
    if (options.length < LIMITS.pollMin || options.length > LIMITS.pollMax) errors.poll = `a enquete precisa de ${LIMITS.pollMin} a ${LIMITS.pollMax} opções`;
    else if (options.some((o) => o.length > LIMITS.pollOption)) errors.poll = `cada opção com até ${LIMITS.pollOption} caracteres`;
    else if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) errors.poll = "há opções repetidas";
    else poll = options;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { title, body: text, isSpoiler: body.isSpoiler === true, catalogEntryId, poll } };
}

export async function createTopic(scope: CommunityScope, userId: string, input: unknown): Promise<{ ok: true; topicId: string } | CommunityError> {
  const parsed = validateTopic(input, scope.works);
  if (!parsed.ok) return { ok: false, status: 400, error: "Corrija os campos indicados.", errors: parsed.errors };
  const community = await findCommunity(scope);
  if (!community || !(await isMember(community.id, userId))) return { ok: false, status: 403, error: "Entre na comunidade para criar um tópico." };
  const { poll, ...data } = parsed.value;
  const topic = await prisma.communityTopic.create({
    data: { ...data, communityId: community.id, authorId: userId, ...(poll ? { poll: { create: { options: { create: poll.map((label, i) => ({ position: i + 1, label })) } } } } : {}) },
    select: { id: true },
  });
  await markVisit(community.id, userId);
  return { ok: true, topicId: topic.id };
}

/** O tópico com a comunidade dele (e a chave de endereço da comunidade); nulo se não existe ou foi apagado. */
export async function loadTopic(topicId: string) {
  const topic = await prisma.communityTopic.findUnique({
    where: { id: topicId },
    include: {
      community: true,
      author: { select: { id: true, displayName: true, handle: true, avatarUrl: true } },
      catalogEntry: { select: { titleRomaji: true, titleNative: true } },
      poll: { include: { options: { orderBy: { position: "asc" }, include: { _count: { select: { votes: true } } } } } },
    },
  });
  if (!topic || topic.deletedAt) return null;
  const scope = await scopeOfCommunity(topic.community);
  return scope ? { topic, scope } : null;
}

export async function createReply(topicId: string, userId: string, input: unknown): Promise<{ ok: true; replyId: string } | CommunityError> {
  const body = (input ?? {}) as Record<string, unknown>;
  const text = clean(body.body);
  if (isBlank(text)) return { ok: false, status: 400, error: "Escreva a resposta.", errors: { body: "escreva a resposta" } };
  if (text.length > LIMITS.reply) return { ok: false, status: 400, error: `Resposta com até ${LIMITS.reply.toLocaleString("pt-BR")} caracteres.`, errors: { body: `até ${LIMITS.reply.toLocaleString("pt-BR")} caracteres` } };
  const topic = await prisma.communityTopic.findUnique({ where: { id: topicId }, select: { id: true, communityId: true, deletedAt: true, lockedAt: true } });
  if (!topic || topic.deletedAt) return { ok: false, status: 404, error: "Tópico não encontrado." };
  if (topic.lockedAt) return { ok: false, status: 409, error: "Tópico trancado pela moderação: não aceita respostas." };
  if (!(await isMember(topic.communityId, userId))) return { ok: false, status: 403, error: "Entre na comunidade para responder." };
  const now = new Date();
  const [reply] = await prisma.$transaction([
    prisma.communityReply.create({ data: { topicId, authorId: userId, body: text, isSpoiler: body.isSpoiler === true, createdAt: now }, select: { id: true } }),
    prisma.communityTopic.update({ where: { id: topicId }, data: { replyCount: { increment: 1 }, lastActivityAt: now } }),
  ]);
  // Avisa quem participa do tópico: quem o criou e quem já respondeu.
  const [repliers, author] = await Promise.all([
    prisma.communityReply.findMany({ where: { topicId, deletedAt: null }, distinct: ["authorId"], select: { authorId: true } }),
    prisma.communityTopic.findUniqueOrThrow({ where: { id: topicId }, select: { authorId: true } }),
  ]);
  await notifyCommunity({ type: "COMMUNITY_REPLY", topicId, replyId: reply.id, actorId: userId, communityId: topic.communityId, recipientIds: [author.authorId, ...repliers.map((r) => r.authorId)] });
  await markVisit(topic.communityId, userId);
  return { ok: true, replyId: reply.id };
}

/** Editar: só quem escreveu. Apagar: quem escreveu ou a equipe de moderação (fica guardado, some da página). */
export async function editTopic(topicId: string, userId: string, input: unknown): Promise<{ ok: true } | CommunityError> {
  const loaded = await loadTopic(topicId);
  if (!loaded) return { ok: false, status: 404, error: "Tópico não encontrado." };
  if (loaded.topic.authorId !== userId) return { ok: false, status: 403, error: "Só quem criou o tópico pode editá-lo." };
  const body = (input ?? {}) as Record<string, unknown>;
  const parsed = validateTopic({ title: body.title ?? loaded.topic.title, body: body.body ?? loaded.topic.body, isSpoiler: body.isSpoiler ?? loaded.topic.isSpoiler, catalogEntryId: body.catalogEntryId === undefined ? loaded.topic.catalogEntryId : body.catalogEntryId }, loaded.scope.works);
  if (!parsed.ok) return { ok: false, status: 400, error: "Corrija os campos indicados.", errors: parsed.errors };
  const { poll: _poll, ...data } = parsed.value;
  void _poll;
  await prisma.communityTopic.update({ where: { id: topicId }, data: { ...data, editedAt: new Date() } });
  return { ok: true };
}

export async function deleteTopic(topicId: string, user: { id: string; canModerate: boolean }): Promise<{ ok: true } | CommunityError> {
  const topic = await prisma.communityTopic.findUnique({ where: { id: topicId }, select: { authorId: true, deletedAt: true } });
  if (!topic || topic.deletedAt) return { ok: false, status: 404, error: "Tópico não encontrado." };
  if (topic.authorId !== user.id && !user.canModerate) return { ok: false, status: 403, error: "Só quem criou o tópico (ou a moderação) pode apagá-lo." };
  await prisma.communityTopic.update({ where: { id: topicId }, data: { deletedAt: new Date() } });
  return { ok: true };
}

export async function editReply(replyId: string, userId: string, input: unknown): Promise<{ ok: true } | CommunityError> {
  const reply = await prisma.communityReply.findUnique({ where: { id: replyId }, select: { authorId: true, deletedAt: true, isSpoiler: true } });
  if (!reply || reply.deletedAt) return { ok: false, status: 404, error: "Resposta não encontrada." };
  if (reply.authorId !== userId) return { ok: false, status: 403, error: "Só quem escreveu pode editar a resposta." };
  const body = (input ?? {}) as Record<string, unknown>;
  const text = clean(body.body);
  if (isBlank(text) || text.length > LIMITS.reply) return { ok: false, status: 400, error: `Resposta com 1 a ${LIMITS.reply.toLocaleString("pt-BR")} caracteres.`, errors: { body: "texto inválido" } };
  await prisma.communityReply.update({ where: { id: replyId }, data: { body: text, isSpoiler: typeof body.isSpoiler === "boolean" ? body.isSpoiler : reply.isSpoiler, editedAt: new Date() } });
  return { ok: true };
}

export async function deleteReply(replyId: string, user: { id: string; canModerate: boolean }): Promise<{ ok: true } | CommunityError> {
  const reply = await prisma.communityReply.findUnique({ where: { id: replyId }, select: { authorId: true, deletedAt: true, topicId: true } });
  if (!reply || reply.deletedAt) return { ok: false, status: 404, error: "Resposta não encontrada." };
  if (reply.authorId !== user.id && !user.canModerate) return { ok: false, status: 403, error: "Só quem escreveu (ou a moderação) pode apagar a resposta." };
  await prisma.$transaction([
    prisma.communityReply.update({ where: { id: replyId }, data: { deletedAt: new Date() } }),
    prisma.communityTopic.update({ where: { id: reply.topicId }, data: { replyCount: { decrement: 1 } } }),
  ]);
  return { ok: true };
}

/** Votar na enquete: um voto por pessoa, sem troca; só quem é da comunidade. */
export async function vote(topicId: string, userId: string, optionId: unknown): Promise<{ ok: true } | CommunityError> {
  const topic = await prisma.communityTopic.findUnique({ where: { id: topicId }, select: { communityId: true, deletedAt: true, lockedAt: true, poll: { select: { id: true, options: { select: { id: true } } } } } });
  if (!topic || topic.deletedAt || !topic.poll) return { ok: false, status: 404, error: "Enquete não encontrada." };
  if (topic.lockedAt) return { ok: false, status: 409, error: "Tópico trancado pela moderação: a enquete está encerrada." };
  if (typeof optionId !== "string" || !topic.poll.options.some((o) => o.id === optionId)) return { ok: false, status: 400, error: "Escolha uma das opções." };
  if (!(await isMember(topic.communityId, userId))) return { ok: false, status: 403, error: "Entre na comunidade para votar." };
  const existing = await prisma.communityPollVote.findUnique({ where: { pollId_userId: { pollId: topic.poll.id, userId } } });
  if (existing) return { ok: false, status: 409, error: "Você já votou nesta enquete." };
  await prisma.communityPollVote.create({ data: { pollId: topic.poll.id, userId, optionId } });
  return { ok: true };
}

// ---------- Leitura ----------

const AUTHOR = { select: { id: true, displayName: true, handle: true, avatarUrl: true } } as const;

/** Tópicos da comunidade, do de atividade mais recente ao mais antigo, sem os de quem a pessoa bloqueou (ou a bloqueou). */
export async function listTopics(communityId: string, page: number, viewerId: string | null, options: { pollsOnly?: boolean; take?: number; query?: string } = {}) {
  const blocked = [...(await blockedUserIdSet(viewerId))];
  const where: Prisma.CommunityTopicWhereInput = {
    communityId,
    deletedAt: null,
    ...(blocked.length ? { authorId: { notIn: blocked } } : {}),
    ...(options.pollsOnly ? { poll: { isNot: null } } : {}),
    ...(options.query ? { AND: forumSearchWords(options.query).map((w) => topicMatches(w, blocked)) } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.communityTopic.count({ where }),
    prisma.communityTopic.findMany({ where, orderBy: [{ pinnedAt: { sort: "desc", nulls: "last" } }, { lastActivityAt: "desc" }, { id: "desc" }], skip: page * TOPICS_PAGE, take: options.take ?? TOPICS_PAGE, include: { author: AUTHOR, catalogEntry: { select: { titleRomaji: true, titleNative: true } }, poll: { select: { id: true } } } }),
  ]);
  return { total, rows };
}

/** Palavras da busca no fórum (sem as curtas demais), no máximo 6. */
export function forumSearchWords(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 2))].slice(0, 6);
}

/** O tópico tem a palavra no título, no texto ou numa resposta visível. */
function topicMatches(word: string, blocked: string[]): Prisma.CommunityTopicWhereInput {
  const contains = { contains: word, mode: "insensitive" as const };
  return { OR: [{ title: contains }, { body: contains }, { replies: { some: { deletedAt: null, body: contains, ...(blocked.length ? { authorId: { notIn: blocked } } : {}) } } }] };
}

/**
 * "Nas suas comunidades" (lateral do Feed): os tópicos com atividade mais recente nas comunidades em que a pessoa
 * participa, sem os de quem tem bloqueio com ela. Cada um com a chave e o nome da comunidade.
 */
export async function activeTopicsForMember(userId: string, take = 5) {
  const memberships = await prisma.communityMember.findMany({ where: { userId }, select: { communityId: true } });
  if (memberships.length === 0) return [];
  const blocked = [...(await blockedUserIdSet(userId))];
  const topics = await prisma.communityTopic.findMany({
    where: { communityId: { in: memberships.map((m) => m.communityId) }, deletedAt: null, ...(blocked.length ? { authorId: { notIn: blocked } } : {}) },
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    take,
    select: { id: true, title: true, replyCount: true, lastActivityAt: true, communityId: true },
  });
  const labels = await communityLabels(topics.map((t) => t.communityId));
  return topics.flatMap((t) => {
    const label = labels.get(t.communityId);
    return label ? [{ id: t.id, title: t.title, replyCount: t.replyCount, lastActivityAt: t.lastActivityAt.toISOString(), communityKey: label.key, community: label.title }] : [];
  });
}

/** Chave e nome de cada comunidade (para os avisos do sino). */
export async function communityLabels(communityIds: string[]): Promise<Map<string, { key: string; title: string }>> {
  const rows = await prisma.community.findMany({ where: { id: { in: [...new Set(communityIds)] } }, select: { id: true, franchiseKey: true, catalogEntryId: true } });
  const out = new Map<string, { key: string; title: string }>();
  for (const c of rows) {
    const scope = await scopeOfCommunity(c);
    if (scope) out.set(c.id, { key: scope.key, title: scope.root.titleRomaji });
  }
  return out;
}

export async function listReplies(topicId: string, page: number, viewerId: string | null) {
  const blocked = [...(await blockedUserIdSet(viewerId))];
  const where = { topicId, deletedAt: null, ...(blocked.length ? { authorId: { notIn: blocked } } : {}) };
  const [total, rows] = await Promise.all([prisma.communityReply.count({ where }), prisma.communityReply.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: page * REPLIES_PAGE, take: REPLIES_PAGE, include: { author: AUTHOR } })]);
  return { total, rows };
}

export type CommunityCard = { communityId: string; key: string; root: CommunityScope["root"]; members: number; topics: number; newActivity: number; lastActivityAt: string | null };

/** "Minhas comunidades": as comunidades em que a pessoa entrou, com quantos tópicos tiveram atividade desde a última visita. */
export async function myCommunities(userId: string): Promise<CommunityCard[]> {
  const memberships = await prisma.communityMember.findMany({ where: { userId }, include: { community: true }, orderBy: { joinedAt: "desc" } });
  const cards: CommunityCard[] = [];
  for (const m of memberships) {
    const scope = await scopeOfCommunity(m.community);
    if (!scope) continue;
    const [members, topics, newActivity, last] = await Promise.all([
      prisma.communityMember.count({ where: { communityId: m.communityId } }),
      prisma.communityTopic.count({ where: { communityId: m.communityId, deletedAt: null } }),
      prisma.communityTopic.count({ where: { communityId: m.communityId, deletedAt: null, lastActivityAt: { gt: m.lastVisitAt } } }),
      prisma.communityTopic.findFirst({ where: { communityId: m.communityId, deletedAt: null }, orderBy: { lastActivityAt: "desc" }, select: { lastActivityAt: true } }),
    ]);
    cards.push({ communityId: m.communityId, key: scope.key, root: scope.root, members, topics, newActivity, lastActivityAt: last?.lastActivityAt.toISOString() ?? null });
  }
  return cards.sort((a, b) => b.newActivity - a.newActivity || (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
}

/** Resumo da comunidade de uma obra, para o cartão na página da obra (não cria nada). */
export async function communitySummary(workKey: string): Promise<{ key: string; members: number; topics: number; latest: Array<{ id: string; title: string; replyCount: number }> } | null> {
  const scope = await scopeForKey(workKey);
  if (!scope) return null;
  const community = await prisma.community.findFirst({
    where: scope.franchiseKey !== null ? { franchiseKey: { in: [scope.franchiseKey, ...scope.works.flatMap((w) => (w.anilistId !== null ? [w.anilistId] : []))] } } : { catalogEntryId: scope.catalogEntryId },
    orderBy: { createdAt: "asc" },
  });
  if (!community) return { key: scope.key, members: 0, topics: 0, latest: [] };
  const [members, topics, latest] = await Promise.all([
    prisma.communityMember.count({ where: { communityId: community.id } }),
    prisma.communityTopic.count({ where: { communityId: community.id, deletedAt: null } }),
    prisma.communityTopic.findMany({ where: { communityId: community.id, deletedAt: null }, orderBy: { lastActivityAt: "desc" }, take: 3, select: { id: true, title: true, replyCount: true } }),
  ]);
  return { key: scope.key, members, topics, latest };
}

// ---------- Moderação (equipe com a permissão "moderation") ----------

/** Fixar/desafixar e trancar/destrancar um tópico. */
export async function moderateTopic(topicId: string, action: "pin" | "unpin" | "lock" | "unlock"): Promise<{ ok: true } | CommunityError> {
  const topic = await prisma.communityTopic.findUnique({ where: { id: topicId }, select: { deletedAt: true } });
  if (!topic || topic.deletedAt) return { ok: false, status: 404, error: "Tópico não encontrado." };
  const now = new Date();
  const data = action === "pin" ? { pinnedAt: now } : action === "unpin" ? { pinnedAt: null } : action === "lock" ? { lockedAt: now } : { lockedAt: null };
  await prisma.communityTopic.update({ where: { id: topicId }, data });
  return { ok: true };
}

/** Descrição da comunidade (vazio volta à sinopse da obra principal). */
export async function updateDescription(scope: CommunityScope, text: unknown): Promise<{ ok: true } | CommunityError> {
  const description = clean(text);
  if (description.length > 2000) return { ok: false, status: 400, error: "Descrição com até 2.000 caracteres." };
  const community = (await findCommunity(scope, { create: true })) as Community;
  await prisma.community.update({ where: { id: community.id }, data: { description: description || null } });
  return { ok: true };
}

/** Denunciar um tópico, uma resposta ou um evento (uma denúncia aberta por pessoa e conteúdo). Vai para Acesso e moderação. */
export async function report(userId: string, input: unknown): Promise<{ ok: true } | CommunityError> {
  const body = (input ?? {}) as Record<string, unknown>;
  const reason = clean(body.reason);
  if (isBlank(reason) || reason.length > 300) return { ok: false, status: 400, error: "Diga o motivo da denúncia (até 300 caracteres).", errors: { reason: "motivo obrigatório" } };
  const topicId = typeof body.topicId === "string" ? body.topicId : null;
  const replyId = typeof body.replyId === "string" ? body.replyId : null;
  const eventId = typeof body.eventId === "string" ? body.eventId : null;
  if ([topicId, replyId, eventId].filter(Boolean).length !== 1) return { ok: false, status: 400, error: "Denuncie um tópico, uma resposta ou um evento." };
  const exists = topicId
    ? await prisma.communityTopic.findFirst({ where: { id: topicId, deletedAt: null }, select: { id: true } })
    : replyId
      ? await prisma.communityReply.findFirst({ where: { id: replyId, deletedAt: null }, select: { id: true } })
      : await prisma.communityEvent.findFirst({ where: { id: eventId as string, deletedAt: null }, select: { id: true } });
  if (!exists) return { ok: false, status: 404, error: "Conteúdo não encontrado." };
  const open = await prisma.communityReport.findFirst({ where: { reporterId: userId, topicId, replyId, eventId, resolvedAt: null }, select: { id: true } });
  if (!open) await prisma.communityReport.create({ data: { reporterId: userId, topicId, replyId, eventId, reason } });
  return { ok: true };
}

/** Fila de denúncias abertas, com o conteúdo e o endereço da comunidade. */
export async function openReports() {
  const rows = await prisma.communityReport.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      reporter: { select: { displayName: true } },
      topic: { select: { id: true, title: true, body: true, deletedAt: true, community: true, author: { select: { displayName: true } } } },
      reply: { select: { id: true, body: true, deletedAt: true, topic: { select: { id: true, title: true, community: true } }, author: { select: { displayName: true } } } },
      event: { select: { id: true, title: true, description: true, deletedAt: true, community: true, author: { select: { displayName: true } } } },
    },
  });
  const out = [];
  for (const r of rows) {
    const community = r.topic?.community ?? r.reply?.topic.community ?? r.event?.community;
    const scope = community ? await scopeOfCommunity(community) : null;
    const topicId = r.topic?.id ?? r.reply?.topic.id ?? null;
    out.push({
      id: r.id,
      kind: r.topicId ? ("topic" as const) : r.replyId ? ("reply" as const) : ("event" as const),
      reason: r.reason,
      reporter: r.reporter.displayName,
      createdAt: r.createdAt.toISOString(),
      author: r.topic?.author.displayName ?? r.reply?.author.displayName ?? r.event?.author.displayName ?? "—",
      title: r.topic?.title ?? r.reply?.topic.title ?? r.event?.title ?? "",
      body: r.topic?.body ?? r.reply?.body ?? r.event?.description ?? "",
      removed: Boolean(r.topic?.deletedAt ?? r.reply?.deletedAt ?? r.event?.deletedAt),
      href: scope && topicId ? `/comunidades/${scope.key}/topicos/${topicId}` : scope && r.event ? `/comunidades/${scope.key}/eventos#evento-${r.event.id}` : null,
      community: scope ? scope.root.titleNative ?? scope.root.titleRomaji : "—",
    });
  }
  return out;
}

/** Resolver: "remove" apaga o conteúdo (some da comunidade); "keep" mantém. Fecha todas as denúncias do mesmo conteúdo. */
export async function resolveReport(reportId: string, action: "remove" | "keep", moderatorId: string): Promise<{ ok: true } | CommunityError> {
  const r = await prisma.communityReport.findUnique({ where: { id: reportId }, select: { topicId: true, replyId: true, eventId: true, resolvedAt: true } });
  if (!r) return { ok: false, status: 404, error: "Denúncia não encontrada." };
  if (r.resolvedAt) return { ok: false, status: 409, error: "Denúncia já resolvida." };
  if (action === "remove") {
    if (r.topicId) await deleteTopic(r.topicId, { id: moderatorId, canModerate: true });
    if (r.replyId) await deleteReply(r.replyId, { id: moderatorId, canModerate: true });
    if (r.eventId) await prisma.communityEvent.updateMany({ where: { id: r.eventId, deletedAt: null }, data: { deletedAt: new Date() } });
  }
  await prisma.communityReport.updateMany({
    where: { resolvedAt: null, ...(r.topicId ? { topicId: r.topicId } : r.replyId ? { replyId: r.replyId } : { eventId: r.eventId }) },
    data: { resolvedAt: new Date(), resolvedById: moderatorId, action: action === "remove" ? "REMOVED" : "KEPT" },
  });
  return { ok: true };
}

// ---------- Eventos ----------

export function validateEvent(input: unknown, now: Date = new Date()): { ok: true; value: { title: string; description: string; startsAt: Date; endsAt: Date | null; place: string | null } } | { ok: false; errors: Record<string, string> } {
  const body = (input ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const title = clean(body.title);
  const description = clean(body.description);
  const place = clean(body.place);
  if (isBlank(title) || title.length > LIMITS.title) errors.title = `título de 1 a ${LIMITS.title} caracteres`;
  if (isBlank(description) || description.length > 2000) errors.description = "descrição de 1 a 2.000 caracteres";
  if (place.length > 200) errors.place = "até 200 caracteres";
  // Instante com fuso explícito (ISO 8601), como nas datas do admin: nunca um horário solto no fuso do servidor.
  const parse = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(v) ? new Date(v) : null);
  const startsAt = parse(body.startsAt);
  const endsAt = body.endsAt ? parse(body.endsAt) : null;
  if (!startsAt) errors.startsAt = "data e hora de início";
  else if (startsAt.getTime() < now.getTime() - 60 * 60_000) errors.startsAt = "o evento precisa ser no futuro";
  if (body.endsAt && !endsAt) errors.endsAt = "data e hora de fim inválidas";
  else if (startsAt && endsAt && endsAt <= startsAt) errors.endsAt = "o fim precisa ser depois do início";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { title, description, startsAt: startsAt as Date, endsAt, place: place || null } };
}

export async function createEvent(scope: CommunityScope, userId: string, input: unknown): Promise<{ ok: true; eventId: string } | CommunityError> {
  const parsed = validateEvent(input);
  if (!parsed.ok) return { ok: false, status: 400, error: "Corrija os campos indicados.", errors: parsed.errors };
  const community = await findCommunity(scope);
  if (!community || !(await isMember(community.id, userId))) return { ok: false, status: 403, error: "Entre na comunidade para criar um evento." };
  const event = await prisma.communityEvent.create({ data: { ...parsed.value, communityId: community.id, authorId: userId }, select: { id: true } });
  // Quem cria vai ao evento.
  await prisma.communityEventRsvp.create({ data: { eventId: event.id, userId, status: "GOING" } });
  // Avisa os membros da comunidade.
  const members = await prisma.communityMember.findMany({ where: { communityId: community.id }, select: { userId: true } });
  await notifyCommunity({ type: "COMMUNITY_EVENT", eventId: event.id, actorId: userId, communityId: community.id, recipientIds: members.map((m) => m.userId) });
  return { ok: true, eventId: event.id };
}

/** Presença: "GOING" (vou), "MAYBE" (talvez) ou nada (desmarcar). Só quem é da comunidade. */
export async function rsvp(eventId: string, userId: string, status: unknown): Promise<{ ok: true } | CommunityError> {
  const event = await prisma.communityEvent.findUnique({ where: { id: eventId }, select: { communityId: true, deletedAt: true } });
  if (!event || event.deletedAt) return { ok: false, status: 404, error: "Evento não encontrado." };
  if (!(await isMember(event.communityId, userId))) return { ok: false, status: 403, error: "Entre na comunidade para confirmar presença." };
  if (status === null) {
    await prisma.communityEventRsvp.deleteMany({ where: { eventId, userId } });
    return { ok: true };
  }
  if (status !== "GOING" && status !== "MAYBE") return { ok: false, status: 400, error: "Presença inválida." };
  await prisma.communityEventRsvp.upsert({ where: { eventId_userId: { eventId, userId } }, create: { eventId, userId, status }, update: { status } });
  return { ok: true };
}

export async function deleteEvent(eventId: string, user: { id: string; canModerate: boolean }): Promise<{ ok: true } | CommunityError> {
  const event = await prisma.communityEvent.findUnique({ where: { id: eventId }, select: { authorId: true, deletedAt: true } });
  if (!event || event.deletedAt) return { ok: false, status: 404, error: "Evento não encontrado." };
  if (event.authorId !== user.id && !user.canModerate) return { ok: false, status: 403, error: "Só quem criou o evento (ou a moderação) pode apagá-lo." };
  await prisma.communityEvent.update({ where: { id: eventId }, data: { deletedAt: new Date() } });
  return { ok: true };
}

/** Eventos da comunidade: os próximos (do mais perto ao mais longe) ou os passados (do mais recente ao mais antigo). */
export async function listEvents(communityId: string, when: "upcoming" | "past", viewerId: string | null, take = 20) {
  const now = new Date();
  const rows = await prisma.communityEvent.findMany({
    where: { communityId, deletedAt: null, ...(when === "upcoming" ? { OR: [{ startsAt: { gte: now } }, { endsAt: { gte: now } }] } : { startsAt: { lt: now }, OR: [{ endsAt: null }, { endsAt: { lt: now } }] }) },
    orderBy: { startsAt: when === "upcoming" ? "asc" : "desc" },
    take,
    include: { author: AUTHOR, rsvps: { select: { userId: true, status: true } } },
  });
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    place: e.place,
    author: e.author,
    going: e.rsvps.filter((r) => r.status === "GOING").length,
    maybe: e.rsvps.filter((r) => r.status === "MAYBE").length,
    mine: (viewerId ? e.rsvps.find((r) => r.userId === viewerId)?.status : null) ?? null,
  }));
}

// ---------- Membros, relacionadas e diretório ----------

export const MEMBERS_PAGE = 30;

/** Membros, dos que entraram por último aos primeiros (a grade da comunidade mostra os 9 primeiros desta lista). */
export async function listMembers(communityId: string, page: number, take = MEMBERS_PAGE) {
  const [total, rows] = await Promise.all([
    prisma.communityMember.count({ where: { communityId } }),
    prisma.communityMember.findMany({ where: { communityId }, orderBy: { joinedAt: "desc" }, skip: page * take, take, include: { user: { select: { id: true, displayName: true, handle: true, avatarUrl: true } } } }),
  ]);
  return { total, rows: rows.map((m) => ({ ...m.user, joinedAt: m.joinedAt.toISOString() })) };
}

export type CommunityLink = { key: string; titleRomaji: string; titleNative: string | null; titleEnglish: string | null; coverImage: string | null; members: number };

/**
 * Comunidades de que a pessoa participa (a grade do perfil): as que entrou por último primeiro. Em lote:
 * a obra que dá nome e capa vem numa consulta (a raiz da franquia, ou a obra da comunidade sem franquia).
 */
export async function memberCommunities(userId: string, take = 9): Promise<{ total: number; rows: CommunityLink[] }> {
  const [total, memberships] = await Promise.all([
    prisma.communityMember.count({ where: { userId } }),
    prisma.communityMember.findMany({ where: { userId }, orderBy: { joinedAt: "desc" }, take, include: { community: { select: { franchiseKey: true, catalogEntryId: true, _count: { select: { members: true } } } } } }),
  ]);
  const franchiseKeys = memberships.flatMap((m) => (m.community.franchiseKey !== null ? [m.community.franchiseKey] : []));
  const entryIds = memberships.flatMap((m) => (m.community.franchiseKey === null && m.community.catalogEntryId ? [m.community.catalogEntryId] : []));
  const select = { id: true, anilistId: true, anidbId: true, kitsuId: true, titleRomaji: true, titleNative: true, titleEnglish: true, coverImage: true } as const;
  const roots = await prisma.catalogEntry.findMany({ where: { OR: [...(franchiseKeys.length ? [{ anilistId: { in: franchiseKeys } }] : []), ...(entryIds.length ? [{ id: { in: entryIds } }] : [])] }, select });
  const byAnilist = new Map(roots.flatMap((r) => (r.anilistId !== null ? [[r.anilistId, r] as const] : [])));
  const byId = new Map(roots.map((r) => [r.id, r]));
  const rows: CommunityLink[] = [];
  for (const m of memberships) {
    const c = m.community;
    const root = c.franchiseKey !== null ? byAnilist.get(c.franchiseKey) : c.catalogEntryId ? byId.get(c.catalogEntryId) : undefined;
    if (root) {
      rows.push({ key: c.franchiseKey !== null ? String(c.franchiseKey) : workKeyOf(root), titleRomaji: root.titleRomaji, titleNative: root.titleNative, titleEnglish: root.titleEnglish, coverImage: root.coverImage, members: c._count.members });
      continue;
    }
    // Raiz fora do catálogo (franquia cuja chave mudou): o caminho completo.
    const scope = await scopeOfCommunity(c);
    if (scope) rows.push({ key: scope.key, titleRomaji: scope.root.titleRomaji, titleNative: scope.root.titleNative, titleEnglish: scope.root.titleEnglish, coverImage: scope.root.coverImage, members: c._count.members });
  }
  return { total, rows };
}

/** Chave da comunidade de uma obra do catálogo (a da franquia ou, sem ela, a da obra). */
const communityKeyOf = (w: { franchiseKey: number | null; anilistId: number | null; anidbId: number | null; kitsuId: number | null }) => (w.franchiseKey !== null ? String(w.franchiseKey) : workKeyOf(w));

/** Quantos membros tem a comunidade de cada chave (as que ainda não existem contam 0). */
async function memberCounts(keys: string[]): Promise<Map<string, number>> {
  const franchiseKeys = keys.filter((k) => /^\d+$/.test(k)).map(Number);
  const rows = franchiseKeys.length ? await prisma.community.findMany({ where: { franchiseKey: { in: franchiseKeys } }, select: { franchiseKey: true, _count: { select: { members: true } } } }) : [];
  return new Map(rows.map((r) => [String(r.franchiseKey), r._count.members]));
}

/**
 * Comunidades relacionadas (coluna da direita): outras franquias com o mesmo gênero principal da obra raiz, das mais
 * populares para as menos. Uma por franquia.
 */
export async function relatedCommunities(scope: CommunityScope, limit = 6): Promise<CommunityLink[]> {
  const root = await prisma.catalogEntry.findFirst({ where: scope.franchiseKey !== null ? { anilistId: scope.franchiseKey } : { id: scope.catalogEntryId as string }, select: { genres: true } });
  const genre = root?.genres?.split(",").find(Boolean);
  if (!genre) return [];
  const own = new Set(scope.works.map((w) => w.id));
  const candidates = await prisma.catalogEntry.findMany({
    where: { onPlatform: true, OR: [{ genres: genre }, { genres: { startsWith: `${genre},` } }, { genres: { endsWith: `,${genre}` } }, { genres: { contains: `,${genre},` } }], NOT: scope.franchiseKey !== null ? { franchiseKey: scope.franchiseKey } : { id: { in: [...own] } } },
    orderBy: [{ popularityRank: { sort: "asc", nulls: "last" } }, { titleRomaji: "asc" }],
    take: limit * 4,
    select: { franchiseKey: true, anilistId: true, anidbId: true, kitsuId: true, titleRomaji: true, titleNative: true, titleEnglish: true, coverImage: true },
  });
  const seen = new Set<string>();
  const picked = candidates.filter((c) => {
    const key = communityKeyOf(c);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
  const counts = await memberCounts(picked.map(communityKeyOf));
  return picked.map((c) => ({ key: communityKeyOf(c), titleRomaji: c.titleRomaji, titleNative: c.titleNative, titleEnglish: c.titleEnglish, coverImage: c.coverImage, members: counts.get(communityKeyOf(c)) ?? 0 }));
}

/** Diretório: as comunidades com mais membros (e, no empate, mais tópicos). */
export async function popularCommunities(limit = 24): Promise<CommunityLink[]> {
  const rows = await prisma.community.findMany({ orderBy: [{ members: { _count: "desc" } }, { topics: { _count: "desc" } }, { createdAt: "asc" }], take: limit, include: { _count: { select: { members: true } } } });
  const out: CommunityLink[] = [];
  for (const c of rows) {
    if (c._count.members === 0) continue;
    const scope = await scopeOfCommunity(c);
    if (scope) out.push({ key: scope.key, titleRomaji: scope.root.titleRomaji, titleNative: scope.root.titleNative, titleEnglish: scope.root.titleEnglish, coverImage: scope.root.coverImage, members: c._count.members });
  }
  return out;
}

/** Diretório: busca pelo nome do anime (qualquer título de qualquer obra da franquia), uma comunidade por franquia. */
export async function searchCommunities(query: string, limit = 24): Promise<CommunityLink[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await prisma.catalogEntry.findMany({
    where: { onPlatform: true, OR: [{ titleRomaji: { contains: q, mode: "insensitive" } }, { titleEnglish: { contains: q, mode: "insensitive" } }, { titleNative: { contains: q, mode: "insensitive" } }] },
    orderBy: [{ popularityRank: { sort: "asc", nulls: "last" } }, { titleRomaji: "asc" }],
    take: limit * 4,
    select: { franchiseKey: true, anilistId: true, anidbId: true, kitsuId: true, titleRomaji: true },
  });
  const keys = [...new Set(rows.map(communityKeyOf).filter(Boolean))].slice(0, limit);
  const out: CommunityLink[] = [];
  const counts = await memberCounts(keys);
  for (const key of keys) {
    const scope = await scopeForKey(key);
    if (scope) out.push({ key: scope.key, titleRomaji: scope.root.titleRomaji, titleNative: scope.root.titleNative, titleEnglish: scope.root.titleEnglish, coverImage: scope.root.coverImage, members: counts.get(scope.key) ?? 0 });
  }
  return out;
}
