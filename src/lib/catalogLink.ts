import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
  const [productions, listEntries, schedule] = await Promise.all([
    db.production.updateMany({ where: { catalogEntryId: fromId }, data: { catalogEntryId: toId } }),
    db.anime.updateMany({ where: { catalogEntryId: fromId }, data: { catalogEntryId: toId } }),
    db.airingScheduleEntry.updateMany({ where: { catalogEntryId: fromId }, data: { catalogEntryId: toId } }),
  ]);
  return { productions: productions.count, listEntries: listEntries.count, schedule: schedule.count };
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
