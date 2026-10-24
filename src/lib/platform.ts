import { prisma } from "@/lib/prisma";
import { ADULT_CONTENT_BLOCKED, hasBlockedGenre, NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";

/**
 * Quais obras fazem parte da plataforma. O catálogo (`CatalogEntry`) também guarda CACHE da AniList, marcado com
 * `onPlatform: false`: isso é só dado de apoio e não aparece em lugar nenhum. Uma obra entra na plataforma quando o
 * admin a traz (upload do HTML do AniDB ou painel de importação da AniList).
 */

/** anilistIds visíveis: catálogo na plataforma + obras que alguém já acompanha. */
export async function platformAnilistIds(): Promise<Set<number>> {
  const [catalog, followed] = await Promise.all([
    prisma.catalogEntry.findMany({ where: { onPlatform: true, anilistId: { not: null }, ...NOT_BLOCKED_GENRE }, select: { anilistId: true } }),
    prisma.anime.findMany({ select: { anilistId: true }, distinct: ["anilistId"] }),
  ]);
  const ids = new Set<number>();
  for (const row of catalog) ids.add(row.anilistId as number);
  for (const row of followed) ids.add(row.anilistId);
  return ids;
}

/**
 * Obras que NÃO podem aparecer (cache da AniList que o admin não trouxe, ou conteúdo adulto). Usado para esconder
 * episódios do cache de calendário: o que o catálogo desconhece (dados antigos) continua visível.
 */
export async function hiddenAnilistIds(): Promise<Set<number>> {
  const rows = await prisma.catalogEntry.findMany({
    // Conteúdo adulto só some quando o bloqueio está ligado (`contentPolicy`); hoje ele é uma categoria da plataforma.
    where: { anilistId: { not: null }, OR: [{ onPlatform: false }, ...(ADULT_CONTENT_BLOCKED ? [{ genres: { contains: "hentai", mode: "insensitive" as const } }] : [])] },
    select: { anilistId: true },
  });
  const hidden = new Set(rows.map((r) => r.anilistId as number));
  // Quem já acompanha a obra continua vendo (a política de conteúdo adulto vale mesmo assim, no calendário).
  return hidden;
}

/**
 * Essa obra pode ser aberta/acompanhada? Se o catálogo a conhece, vale a marca `onPlatform`; se não (dados antigos,
 * produções e episódios que já existiam), basta existir produção, episódio no calendário ou quem a acompanhe.
 */
export async function isOnPlatform(anilistId: number): Promise<boolean> {
  const entry = await prisma.catalogEntry.findUnique({ where: { anilistId }, select: { onPlatform: true, genres: true } });
  if (entry) return entry.onPlatform && !hasBlockedGenre(entry.genres);
  const [production, airing, followed] = await Promise.all([
    prisma.production.findUnique({ where: { anilistId }, select: { id: true, genres: true } }),
    prisma.airingScheduleEntry.findFirst({ where: { anilistId }, select: { id: true, genres: true } }),
    prisma.anime.findFirst({ where: { anilistId }, select: { id: true, genres: true } }),
  ]);
  const known = production ?? airing ?? followed;
  return Boolean(known) && !hasBlockedGenre(known?.genres);
}
