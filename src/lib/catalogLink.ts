import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { moveExtras } from "@/lib/episodeExtras";
import { siteScoreOf } from "@/lib/siteScore";

/**
 * Identidade interna da obra (Fase 2, ADR 0008). O catálogo (`CatalogEntry.id`) é a chave; o `anilistId` é só um
 * identificador externo, que obras só do AniDB não têm. Toda cópia (produção, item de lista) e todo episódio da agenda
 * aponta para a obra pelo `catalogEntryId`. Quem cria essas linhas usa estas funções para preencher o vínculo.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** Id do catálogo de uma obra da AniList (ou nulo, se ela ainda não está no catálogo). */
export async function catalogEntryIdFor(anilistId: number, db: Db = prisma): Promise<string | null> {
  const row = await db.catalogEntry.findUnique({ where: { anilistId }, select: { id: true } });
  return row?.id ?? null;
}

/** O mesmo, em lote: anilistId → id do catálogo. */
export async function catalogEntryIdsFor(anilistIds: number[], db: Db = prisma): Promise<Map<number, string>> {
  if (anilistIds.length === 0) return new Map();
  const rows = await db.catalogEntry.findMany({ where: { anilistId: { in: Array.from(new Set(anilistIds)) } }, select: { id: true, anilistId: true } });
  return new Map(rows.map((r) => [r.anilistId as number, r.id]));
}

/**
 * Antes de apagar uma obra do catálogo que é a mesma de outra (religar AniDB → AniList, juntar duplicata), tudo que
 * apontava para ela passa a apontar para a que fica. Sem isto o banco recusa a exclusão (chave estrangeira RESTRICT).
 */
export async function reassignCatalogEntry(fromId: string, toId: string, db: Db = prisma): Promise<{ productions: number; listEntries: number; schedule: number }> {
  const target = await db.catalogEntry.findUnique({ where: { id: toId }, select: { anilistId: true } });
  const productions = await db.production.updateMany({ where: { catalogEntryId: fromId }, data: { catalogEntryId: toId } });
  const listEntries = await mergeListEntriesInto(fromId, toId, target?.anilistId ?? null, db);
  const schedule = await mergeScheduleInto(fromId, toId, target?.anilistId ?? null, db);
  await moveExtras(fromId, toId, db);
  await moveCommunity(fromId, toId, target?.anilistId ?? null, db);
  return { productions: productions.count, listEntries, schedule };
}

/**
 * Leva a comunidade de uma obra para outra (junção AniDB → AniList): publicações e comentários passam a ser da obra de
 * destino (com o AniList ID dela). O quiz também — mas, se a obra de destino já tem o dela, o de origem é arquivado (sai
 * do ar sem perder perguntas, tentativas nem títulos já concedidos), porque cada obra tem um quiz só.
 */
export async function moveCommunity(fromId: string, toId: string, toAnilistId: number | null, db: Db = prisma): Promise<{ posts: number; comments: number; quiz: "moved" | "archived" | "none" }> {
  const data = { catalogEntryId: toId, ...(toAnilistId !== null ? { anilistId: toAnilistId } : {}) };
  const [posts, comments] = await Promise.all([
    db.post.updateMany({ where: { catalogEntryId: fromId }, data }),
    db.comment.updateMany({ where: { catalogEntryId: fromId }, data }),
  ]);
  const quiz = await db.quiz.findUnique({ where: { catalogEntryId: fromId }, select: { id: true } });
  if (!quiz) return { posts: posts.count, comments: comments.count, quiz: "none" };
  const taken = await db.quiz.findFirst({ where: { NOT: { id: quiz.id }, OR: [{ catalogEntryId: toId }, ...(toAnilistId !== null ? [{ anilistId: toAnilistId }] : [])] }, select: { id: true } });
  if (taken) {
    await db.quiz.update({ where: { id: quiz.id }, data: { catalogEntryId: null, archivedAt: new Date() } });
    return { posts: posts.count, comments: comments.count, quiz: "archived" };
  }
  await db.quiz.update({ where: { id: quiz.id }, data });
  return { posts: posts.count, comments: comments.count, quiz: "moved" };
}

/**
 * Leva os itens de lista de uma obra para outra. Quem acompanhava a obra só do AniDB passa a acompanhar a da AniList (o
 * item ganha o AniList ID). Se a pessoa já tinha a de destino, fica um item só: o de destino, que herda o que lhe faltava
 * (favorito, andamento, nota, "onde eu assisto") — nada do que a pessoa marcou se perde. A nota do site é refeita.
 */
export async function mergeListEntriesInto(fromId: string, toId: string, toAnilistId: number | null, db: Db = prisma): Promise<number> {
  const rows = await db.anime.findMany({ where: { catalogEntryId: fromId }, include: { platformLinks: true } });
  for (const row of rows) {
    const twin = await db.anime.findFirst({
      where: { NOT: { id: row.id }, userId: row.userId, OR: [{ catalogEntryId: toId }, ...(toAnilistId !== null ? [{ anilistId: toAnilistId }] : [])] },
      include: { platformLinks: true },
    });
    if (!twin) {
      await db.anime.update({ where: { id: row.id }, data: { catalogEntryId: toId, ...(toAnilistId !== null ? { anilistId: toAnilistId } : {}) } });
      continue;
    }
    const platforms = new Set(twin.platformLinks.map((l) => l.platform));
    for (const link of row.platformLinks) if (!platforms.has(link.platform)) await db.platformLink.update({ where: { id: link.id }, data: { animeId: twin.id } });
    await db.anime.update({
      where: { id: twin.id },
      data: {
        catalogEntryId: toId,
        ...(row.isFavorite && !twin.isFavorite ? { isFavorite: true, favoritedAt: row.favoritedAt } : {}),
        ...(twin.watchState === null && row.watchState !== null ? { watchState: row.watchState } : {}),
        ...(twin.userScore === null && row.userScore !== null ? { userScore: row.userScore, scoredAt: row.scoredAt } : {}),
      },
    });
    await db.anime.delete({ where: { id: row.id } });
  }
  if (rows.length > 0) {
    const votes = await db.anime.findMany({ where: { catalogEntryId: toId, userScore: { not: null }, watchState: "FINISHED" }, select: { userScore: true } });
    const score = siteScoreOf(votes.map((v) => v.userScore as number));
    await db.catalogEntry.update({ where: { id: toId }, data: { siteScore: score.score, siteScoreVotes: score.votes } });
  }
  return rows.length;
}

const EPISODE_CONTENT = ["episodeTitle", "episodeTitleEn", "episodeTitleJa", "synopsis", "thumbnail"] as const;

/**
 * Leva os episódios de uma obra para outra (ou dá o AniList ID aos da própria obra) sem colidir no número: o episódio que
 * a obra de destino já tem (ex.: o da AniList, com horário) fica e só recebe o que faltava (título, sinopse, imagem, dia);
 * o de origem sai. Os demais passam para a obra de destino com o AniList ID dela. Devolve quantos foram levados.
 */
export async function mergeScheduleInto(fromId: string, toId: string, toAnilistId: number | null, db: Db = prisma): Promise<number> {
  const rows = await db.airingScheduleEntry.findMany({ where: { catalogEntryId: fromId } });
  let moved = 0;
  for (const row of rows) {
    const twin = await db.airingScheduleEntry.findFirst({
      where: { NOT: { id: row.id }, episode: row.episode, OR: [{ catalogEntryId: toId }, ...(toAnilistId !== null ? [{ anilistId: toAnilistId }] : [])] },
    });
    if (twin) {
      const manual = new Set(twin.manualFields);
      const fill: Record<string, unknown> = {};
      for (const f of EPISODE_CONTENT) if (!manual.has(f) && twin[f] === null && row[f] !== null) fill[f] = row[f];
      if (!manual.has("airDate") && twin.airingAt === null && twin.airDate === null && row.airDate !== null) Object.assign(fill, { airDate: row.airDate, dateCertainty: "DATE_ONLY" });
      await db.airingScheduleEntry.delete({ where: { id: row.id } });
      await db.airingScheduleEntry.update({ where: { id: twin.id }, data: { ...fill, catalogEntryId: toId, ...(toAnilistId !== null ? { anilistId: toAnilistId } : {}) } });
    } else {
      await db.airingScheduleEntry.update({ where: { id: row.id }, data: { catalogEntryId: toId, ...(toAnilistId !== null ? { anilistId: toAnilistId } : {}) } });
    }
    moved += 1;
  }
  return moved;
}

/**
 * Preenche o vínculo de quem ainda não tem (linha criada antes da obra entrar no catálogo, ou por um caminho antigo).
 * Idempotente; devolve quantas linhas foram ligadas em cada tabela.
 */
export async function linkMissingCatalogIds(db: Db = prisma): Promise<{ productions: number; listEntries: number; schedule: number }> {
  const [productions, listEntries, schedule] = await Promise.all([
    db.$executeRaw`UPDATE "Production" p SET "catalogEntryId" = c."id" FROM "CatalogEntry" c WHERE c."anilistId" = p."anilistId" AND p."catalogEntryId" IS NULL`,
    db.$executeRaw`UPDATE "Anime" a SET "catalogEntryId" = c."id" FROM "CatalogEntry" c WHERE c."anilistId" = a."anilistId" AND a."catalogEntryId" IS NULL`,
    db.$executeRaw`UPDATE "AiringScheduleEntry" s SET "catalogEntryId" = c."id" FROM "CatalogEntry" c WHERE c."anilistId" = s."anilistId" AND s."catalogEntryId" IS NULL`,
  ]);
  return { productions, listEntries, schedule };
}
