import { prisma } from "@/lib/prisma";
import { getKitsuEpisodes, searchKitsuAnime } from "@/lib/kitsu";
import type { Anime, Episode } from "@prisma/client";

export type EpisodesResult = {
  episodes: Episode[];
  source: "cache" | "kitsu";
  error?: string;
};

const OTHER_SOURCES_DISABLED = process.env.DISABLE_OTHER_SOURCES === "true";

/**
 * `@@unique([userId, kitsuId])` no schema — dois animes de nomes parecidos
 * (ex.: "Naruto" e "Naruto Shippuden") podem legitimamente resolver pro
 * mesmo `kitsuId` via `searchKitsuAnime`. Sem essa checagem, o 2º a
 * carregar quebrava a página inteira com um erro cru do Prisma (achado
 * real da 8ª rodada de auditoria, Epic 18) — o 1º anime a reivindicar um
 * kitsuId o mantém; o resto só usa esse id pra buscar episódios (ainda
 * funciona, graças ao cache em `Episode`), sem tentar gravar no próprio
 * registro.
 */
async function kitsuIdAvailable(
  userId: string | null,
  animeId: string,
  kitsuId: number
): Promise<boolean> {
  if (!userId) return true;
  const conflict = await prisma.anime.findFirst({
    where: { userId, kitsuId, NOT: { id: animeId } },
    select: { id: true },
  });
  return conflict === null;
}

async function fetchAndStoreEpisodes(
  animeId: string,
  kitsuId: number
): Promise<Episode[]> {
  const kitsuEpisodes = await getKitsuEpisodes(kitsuId);
  if (kitsuEpisodes.length === 0) return [];

  // Chave composta (seasonNumber + number), não só `number`: o campo
  // "reinicia a cada temporada" (ver comentário de Episode.number no
  // schema), então um anime com várias seasonNumber numa única entrada
  // Kitsu (ex.: One Piece) tem episódios de temporadas diferentes com o
  // mesmo `number` — dedup só por `number` descartava silenciosamente
  // toda temporada 2+ sempre que a numeração local colidia com a 1ª
  // (achado real da 13ª rodada de auditoria, Epic 18).
  const seenKeys = new Set<string>();
  const uniqueEpisodes = kitsuEpisodes.filter((ep) => {
    const key = `${ep.seasonNumber}:${ep.number}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
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
      synopsis: ep.synopsis,
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

      const canClaimKitsuId = await kitsuIdAvailable(anime.userId, anime.id, kitsuId);
      await prisma.anime.update({
        where: { id: anime.id },
        data: {
          ...(canClaimKitsuId ? { kitsuId } : {}),
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
      const canClaimKitsuId = await kitsuIdAvailable(anime.userId, anime.id, kitsuId);
      await prisma.anime.update({
        where: { id: anime.id },
        data: {
          ...(canClaimKitsuId ? { kitsuId } : {}),
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
