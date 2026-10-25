import { prisma } from "@/lib/prisma";
import { getKitsuEpisodes, searchKitsuAnime } from "@/lib/kitsu";
import { asEpisodes, hasEpisodeContent, loadGlobalEpisodes, markEpisodesChecked, recentlyChecked, upsertSourceEpisodes } from "@/lib/globalEpisodes";
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

/**
 * Busca os episódios na Kitsu e grava no episódio GLOBAL da obra (Fase 4): o mesmo para todo mundo, nunca uma cópia
 * por usuário. `refresh` troca o que mudou (botão "Atualizar dados"); senão só completa o que falta.
 */
async function fetchAndStoreEpisodes(anime: Anime, kitsuId: number, mode: "fill" | "refresh" = "fill"): Promise<Episode[]> {
  // A mesma (temporada, número) repetida é o mesmo episódio; números iguais em temporadas internas diferentes são
  // ambíguos e ficam de fora no upsert (a contagem reinicia e não dá para saber qual é o desta obra).
  const seen = new Set<string>();
  const kitsuEpisodes = (await getKitsuEpisodes(kitsuId)).filter((ep) => {
    const key = `${ep.seasonNumber}:${ep.number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const written = await upsertSourceEpisodes(
    anime.anilistId,
    { titleRomaji: anime.titleRomaji, titleEnglish: anime.titleEnglish, titleNative: anime.titleNative },
    kitsuEpisodes.map((ep) => ({ ...ep, airDate: ep.airDate ? new Date(ep.airDate) : null })),
    "kitsu",
    mode
  );
  await markEpisodesChecked(anime.anilistId, kitsuId, kitsuEpisodes.length);
  if (kitsuEpisodes.length === 0 && written === 0) return [];
  return asEpisodes(await loadGlobalEpisodes(anime.anilistId));
}

/**
 * Retorna os episódios de um anime. Se já tiver cache no banco, usa direto
 * (resiliente a a Kitsu cair). Senão, busca na Kitsu, salva no banco e
 * aproveita pra completar título JP / capa que estiverem faltando.
 */
export async function ensureEpisodes(anime: Anime): Promise<EpisodesResult> {
  // Episódios globais da obra. Com título/sinopse/imagem já gravados, ou consultada há pouco, não pergunta à Kitsu de novo.
  const rows = await loadGlobalEpisodes(anime.anilistId);
  if (hasEpisodeContent(rows) || (await recentlyChecked(anime.anilistId))) {
    return { episodes: asEpisodes(rows), source: "cache" };
  }

  if (OTHER_SOURCES_DISABLED) {
    return {
      episodes: asEpisodes(rows),
      source: "cache",
      error: rows.length > 0 ? undefined : "Kitsu desativada temporariamente (modo AniDB-only) — vincule o ID da AniDB e use Atualizar dados",
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

    const episodes = await fetchAndStoreEpisodes(anime, kitsuId);
    if (episodes.length === 0) {
      return { episodes: asEpisodes(rows), source: "kitsu", error: rows.length > 0 ? undefined : "Sem episódios cadastrados na Kitsu" };
    }
    return { episodes, source: "kitsu" };
  } catch (error) {
    return {
      episodes: asEpisodes(rows),
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

    const episodes = await fetchAndStoreEpisodes(anime, kitsuId, "refresh");
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
