import { prisma } from "@/lib/prisma";
import { siteScoreOf } from "@/lib/siteScore";

/** Nota do site de uma obra a partir das notas de quem terminou (curadoria e sempre que alguém avalia ou muda o andamento). */
export async function recomputeSiteScore(anilistId: number): Promise<{ score: number; votes: number }> {
  const rows = await prisma.anime.findMany({ where: { anilistId, userScore: { not: null }, watchState: "FINISHED" }, select: { userScore: true } });
  const result = siteScoreOf(rows.map((r) => r.userScore as number));
  await prisma.catalogEntry.updateMany({ where: { anilistId }, data: { siteScore: result.score, siteScoreVotes: result.votes } });
  return result;
}
