import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Limpeza das obras criadas por um teste. Desde a Fase 2 (ADR 0008) produção, item de lista e episódio da agenda apontam
 * para a obra com chave estrangeira RESTRICT: o banco não deixa apagar a obra antes deles. Apaga primeiro o que foi ligado
 * a ela (pelas páginas e rotas que o teste exercitou) e depois a obra.
 */
export async function deleteCatalogEntries(prisma: PrismaClient, args: { where: Prisma.CatalogEntryWhereInput }) {
  const ids = (await prisma.catalogEntry.findMany({ where: args.where, select: { id: true } })).map((e) => e.id);
  if (ids.length > 0) {
    await prisma.production.deleteMany({ where: { catalogEntryId: { in: ids } } });
    await prisma.anime.deleteMany({ where: { catalogEntryId: { in: ids } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { catalogEntryId: { in: ids } } });
  }
  return prisma.catalogEntry.deleteMany(args);
}
