import type { CatalogEntry, Community, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { blockedUserIdSet } from "@/lib/blocks";
import { isBlank } from "@/lib/text";
import { resolveWorkKey } from "@/lib/workRef";
import { catalogSlug } from "@/lib/workHref";

/**
 * Comunidades (estilo Orkut): o fórum de cada anime. Uma comunidade por franquia do catálogo (`franchiseKey`, Epic 45:
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
  const topic = await prisma.communityTopic.findUnique({ where: { id: topicId }, select: { id: true, communityId: true, deletedAt: true } });
  if (!topic || topic.deletedAt) return { ok: false, status: 404, error: "Tópico não encontrado." };
  if (!(await isMember(topic.communityId, userId))) return { ok: false, status: 403, error: "Entre na comunidade para responder." };
  const now = new Date();
  const [reply] = await prisma.$transaction([
    prisma.communityReply.create({ data: { topicId, authorId: userId, body: text, isSpoiler: body.isSpoiler === true, createdAt: now }, select: { id: true } }),
    prisma.communityTopic.update({ where: { id: topicId }, data: { replyCount: { increment: 1 }, lastActivityAt: now } }),
  ]);
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
  const topic = await prisma.communityTopic.findUnique({ where: { id: topicId }, select: { communityId: true, deletedAt: true, poll: { select: { id: true, options: { select: { id: true } } } } } });
  if (!topic || topic.deletedAt || !topic.poll) return { ok: false, status: 404, error: "Enquete não encontrada." };
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
export async function listTopics(communityId: string, page: number, viewerId: string | null) {
  const blocked = [...(await blockedUserIdSet(viewerId))];
  const where = { communityId, deletedAt: null, ...(blocked.length ? { authorId: { notIn: blocked } } : {}) };
  const [total, rows] = await Promise.all([
    prisma.communityTopic.count({ where }),
    prisma.communityTopic.findMany({ where, orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }], skip: page * TOPICS_PAGE, take: TOPICS_PAGE, include: { author: AUTHOR, catalogEntry: { select: { titleRomaji: true, titleNative: true } }, poll: { select: { id: true } } } }),
  ]);
  return { total, rows };
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
