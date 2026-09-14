import { prisma } from "@/lib/prisma";
import { getKitsuEpisodes, searchKitsuAnime } from "@/lib/kitsu";
import type { Anime, Episode } from "@prisma/client";

export type EpisodesResult = {
  episodes: Episode[];
  source: "cache" | "kitsu";
  error?: string;
};

const OTHER_SOURCES_DISABLED = process.env.DISABLE_OTHER_SOURCES === "true";

async function fetchAndStoreEpisodes(
  animeId: string,
  kitsuId: number
): Promise<Episode[]> {
  const kitsuEpisodes = await getKitsuEpisodes(kitsuId);
  if (kitsuEpisodes.length === 0) return [];

  const seenNumbers = new Set<number>();
  const uniqueEpisodes = kitsuEpisodes.filter((ep) => {
    if (seenNumbers.has(ep.number)) return false;
    seenNumbers.add(ep.number);
    return true;
  });

  await prisma.episode.deleteMany({ where: { animeId } });
  await prisma.episode.createMany({
    data: uniqueEpisodes.map((ep) => ({
      animeId,
      number: ep.number,
      seasonNumber: ep.seasonNumber,
      titleRomaji: ep.titleRomaji,
      titleEnglish: ep.titleEnglish,
      titleJapanese: ep.titleJapanese,
      thumbnail: ep.thumbnail,
      airDate: ep.airDate ? new Date(ep.airDate) : null,
    })),
  });

  return prisma.episode.findMany({
    where: { animeId },
    orderBy: { number: "asc" },
  });
}

/**
 * Retorna os episódios de um anime. Se já tiver cache no banco, usa direto
 * (resiliente a a Kitsu cair). Senão, busca na Kitsu, salva no banco e
 * aproveita pra completar título JP / capa que estiverem faltando.
 */
export async function ensureEpisodes(anime: Anime): Promise<EpisodesResult> {
  const cached = await prisma.episode.findMany({
    where: { animeId: anime.id },
    orderBy: { number: "asc" },
  });
  if (cached.length > 0) {
    return { episodes: cached, source: "cache" };
  }

  if (OTHER_SOURCES_DISABLED) {
    return {
      episodes: [],
      source: "cache",
      error: "Kitsu desativada temporariamente (modo AniDB-only) — vincule o ID da AniDB e use Atualizar dados",
    };
  }

  try {
    let kitsuId = anime.kitsuId;

    if (!kitsuId) {
      const match = await searchKitsuAnime(anime.titleRomaji);
      if (!match) {
        return { episodes: [], source: "kitsu", error: "Anime não encontrado na Kitsu" };
      }
      kitsuId = match.kitsuId;

      await prisma.anime.update({
        where: { id: anime.id },
        data: {
          kitsuId,
          titleNative: anime.titleNative ?? match.titleJapanese,
          coverImage: anime.coverImage ?? match.posterImage,
          bannerImage: anime.bannerImage ?? match.coverImage,
          description: anime.description ?? match.synopsis,
          episodes: anime.episodes ?? match.episodeCount,
          genres: anime.genres || match.genres.join(","),
        },
      });
    }

    const episodes = await fetchAndStoreEpisodes(anime.id, kitsuId);
    if (episodes.length === 0) {
      return { episodes: [], source: "kitsu", error: "Sem episódios cadastrados na Kitsu" };
    }
    return { episodes, source: "kitsu" };
  } catch (error) {
    return {
      episodes: [],
      source: "kitsu",
      error: error instanceof Error ? error.message : "Falha ao buscar episódios",
    };
  }
}

/**
 * Força buscar de novo na Kitsu, ignorando o cache — usado pelo botão
 * "Atualizar dados". Sempre busca o match (não só quando falta kitsuId),
 * pra também completar capa/banner/sinopse/gêneros que estejam faltando —
 * sem isso, um anime com esses campos zerados (ex.: depois de "limpar
 * cache") continuava sem imagem mesmo com "kitsu: ok".
 */
export async function refetchEpisodes(anime: Anime): Promise<EpisodesResult> {
  try {
    const match = await searchKitsuAnime(anime.titleRomaji);
    const kitsuId = match?.kitsuId ?? anime.kitsuId;
    if (!kitsuId) {
      return { episodes: [], source: "kitsu", error: "Anime não encontrado na Kitsu" };
    }

    if (match) {
      await prisma.anime.update({
        where: { id: anime.id },
        data: {
          kitsuId,
          titleNative: anime.titleNative ?? match.titleJapanese,
          coverImage: anime.coverImage ?? match.posterImage,
          bannerImage: anime.bannerImage ?? match.coverImage,
          description: anime.description ?? match.synopsis,
          episodes: anime.episodes ?? match.episodeCount,
          genres: anime.genres || match.genres.join(","),
        },
      });
    }

    const episodes = await fetchAndStoreEpisodes(anime.id, kitsuId);
    if (episodes.length === 0) {
      return { episodes: [], source: "kitsu", error: "Sem episódios cadastrados na Kitsu" };
    }
    return { episodes, source: "kitsu" };
  } catch (error) {
    return {
      episodes: [],
      source: "kitsu",
      error: error instanceof Error ? error.message : "Falha ao buscar episódios",
    };
  }
}
