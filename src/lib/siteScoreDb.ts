import { prisma } from "@/lib/prisma";
import { siteScoreOf } from "@/lib/siteScore";

/**
 * Nota do site de uma obra a partir das notas de quem terminou (curadoria e sempre que alguém avalia ou muda o andamento).
 * A obra é a da AniList ou, sem AniList ID (só do AniDB/Kitsu), a do catálogo.
 */
export async function recomputeSiteScore(work: number | { anilistId: number | null; catalogEntryId?: string | null }): Promise<{ score: number; votes: number }> {
  const { anilistId, catalogEntryId } = typeof work === "number" ? { anilistId: work, catalogEntryId: null } : work;
  if (anilistId === null && !catalogEntryId) return siteScoreOf([]);
  const key = anilistId !== null ? { anilistId } : { catalogEntryId: catalogEntryId as string };
  const rows = await prisma.anime.findMany({ where: { ...key, userScore: { not: null }, watchState: "FINISHED" }, select: { userScore: true } });
  const result = siteScoreOf(rows.map((r) => r.userScore as number));
  await prisma.catalogEntry.updateMany({ where: anilistId !== null ? { anilistId } : { id: catalogEntryId as string }, data: { siteScore: result.score, siteScoreVotes: result.votes } });
  return result;
}
