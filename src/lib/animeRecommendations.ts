import { prisma } from "@/lib/prisma";
import type { AniListRecommendation } from "@/lib/anilist";
import type { RecommendationData } from "@/components/RecommendationCard";

/**
 * Agrega recomendações da AniList (Epic 14) de TODOS os animes da lista
 * do usuário pra lateral do Feed (Epic 26) — sem chamada nova à AniList:
 * `Anime.recommendationsJson` já é persistido por anime na criação/
 * refresh (src/lib/resolveAnimeMedia.ts, src/lib/refreshAnimeData.ts),
 * então isso só lê o que já está no banco. Deduplica por anilistId
 * (mantém a 1ª ocorrência) e exclui qualquer anilistId que o usuário já
 * tem na própria lista (recomendar um anime que a pessoa já assiste não
 * ajuda) — como tudo que sobra por definição não está na lista dele,
 * todo item devolvido é externo (link direto pra AniList), diferente da
 * página de detalhe do anime (que resolve link interno pra quem já tem o
 * anime recomendado — aqui isso nunca acontece por construção).
 */
export async function getAggregatedRecommendations(
  userId: string,
  limit: number
): Promise<RecommendationData[]> {
  const animes = await prisma.anime.findMany({
    where: { userId },
    select: { anilistId: true, recommendationsJson: true },
  });

  const ownedAnilistIds = new Set(animes.map((a) => a.anilistId));
  const seen = new Set<number>();
  const results: RecommendationData[] = [];

  for (const anime of animes) {
    if (!anime.recommendationsJson) continue;
    let recs: AniListRecommendation[];
    try {
      recs = JSON.parse(anime.recommendationsJson);
    } catch {
      continue;
    }
    for (const rec of recs) {
      if (ownedAnilistIds.has(rec.anilistId) || seen.has(rec.anilistId)) continue;
      seen.add(rec.anilistId);
      results.push({
        anilistId: rec.anilistId,
        titleRomaji: rec.titleRomaji,
        titleEnglish: rec.titleEnglish,
        coverImage: rec.coverImage,
        href: `https://anilist.co/anime/${rec.anilistId}`,
        isInternal: false,
      });
      if (results.length >= limit) return results;
    }
  }

  return results;
}
