import { prisma } from "@/lib/prisma";
import { getAnimeById, getOfficialSiteUrl } from "@/lib/anilist";

export type NormalizedMedia = {
  id: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  genres: string;
  averageScore: number | null;
  officialSite: string | null;
  trailerId: string | null;
  trailerSite: string | null;
  castJson: string | null;
  recommendationsJson: string | null;
};

/**
 * Resolve os dados de um anime pelo anilistId pra adicionar à lista pessoal:
 * AniList ao vivo; se falhar, cai pro CatalogEntry já cacheado. Extraído de
 * src/app/api/anime/route.ts pra ser chamado tanto pelo cache-updater
 * (caminho principal) quanto pelo fallback local da rota.
 */
export async function resolveAnimeMedia(anilistId: number): Promise<NormalizedMedia> {
  try {
    const media = await getAnimeById(anilistId);
    return {
      id: media.id,
      titleRomaji: media.title.romaji,
      titleEnglish: media.title.english,
      titleNative: media.title.native,
      coverImage: media.coverImage.extraLarge,
      bannerImage: media.bannerImage,
      description: media.description,
      episodes: media.episodes,
      status: media.status,
      season: media.season,
      seasonYear: media.seasonYear,
      genres: media.genres.join(","),
      averageScore: media.averageScore,
      officialSite: getOfficialSiteUrl(media),
      trailerId: media.trailer?.id ?? null,
      trailerSite: media.trailer?.site ?? null,
      castJson: media.cast.length ? JSON.stringify(media.cast) : null,
      recommendationsJson: media.recommendations.length
        ? JSON.stringify(media.recommendations)
        : null,
    };
  } catch (error) {
    const cached = await prisma.catalogEntry.findUnique({ where: { anilistId } });
    if (!cached) throw error;
    return {
      id: anilistId,
      titleRomaji: cached.titleRomaji,
      titleEnglish: cached.titleEnglish,
      titleNative: cached.titleNative,
      coverImage: cached.coverImage,
      bannerImage: cached.bannerImage,
      description: cached.description,
      episodes: cached.episodes,
      status: cached.status,
      season: cached.season,
      seasonYear: cached.seasonYear,
      genres: cached.genres ?? "",
      averageScore: cached.averageScore,
      // CatalogEntry (o cache local) não guarda site oficial, trailer,
      // elenco nem recomendações — só entram quando a AniList responde ao
      // vivo, no caminho de cima. Ficam vazios até o 1º "Atualizar dados".
      officialSite: null,
      trailerId: null,
      trailerSite: null,
      castJson: null,
      recommendationsJson: null,
    };
  }
}
