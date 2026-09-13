import { prisma } from "@/lib/prisma";
import { getAnimeById } from "@/lib/anilist";
import { refetchEpisodes } from "@/lib/episodes";
import { searchJikanAnime } from "@/lib/jikan";
import { searchShikimoriAnime } from "@/lib/shikimori";
import { getAnidbAnimeById, isAnidbConfigured } from "@/lib/anidb";
import { mergeGenres, pickAnidbTitles, type AnidbTitleCandidate } from "@/lib/identityResolution";
import { callInternalService } from "@/lib/serviceDelegate";
import type { Anime } from "@prisma/client";

export type SourceStatus = "ok" | "failed" | "skipped" | "disabled";
export type RefreshResult = { status: Record<string, SourceStatus>; episodeCount: number };

const OTHER_SOURCES_DISABLED = process.env.DISABLE_OTHER_SOURCES === "true";

/** Tenta o name-resolver pra fusão/escolha de identidade; cai pro cálculo
 * puro local (src/lib/identityResolution.ts) se o serviço estiver fora do
 * ar — mesmas funções por trás dos dois caminhos, só muda onde rodam. */
async function resolveIdentity(
  body: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  return callInternalService<Record<string, unknown>>(
    process.env.NAME_RESOLVER_URL,
    "/resolve-identity",
    body
  );
}

/**
 * Atualiza os dados do anime a partir das fontes gratuitas já integradas —
 * AniList, Kitsu, Jikan (API aberta do MyAnimeList), Shikimori e AniDB. Não
 * fazemos webscraping de sites como Crunchyroll/MAL/AniDB: além de violar
 * os termos de uso deles (e ser frágil — são protegidos contra bots), essas
 * APIs já cobrem imagem, sinopse, gêneros, episódios e datas de forma
 * legítima. DISABLE_OTHER_SOURCES=true deixa só a AniDB ativa (modo de teste).
 *
 * Extraído de src/app/api/anime/[id]/refresh/route.ts pra ser chamado tanto
 * pelo cache-updater (caminho principal) quanto pelo fallback local da
 * rota. Recebe o anime já carregado (dono já verificado pelo chamador).
 */
export async function refreshAnimeData(initialAnime: Anime): Promise<RefreshResult> {
  const { id } = initialAnime;
  let anime = initialAnime;

  const status: Record<string, SourceStatus> = {
    anilist: OTHER_SOURCES_DISABLED ? "disabled" : "skipped",
    kitsu: OTHER_SOURCES_DISABLED ? "disabled" : "skipped",
    jikan: OTHER_SOURCES_DISABLED ? "disabled" : "skipped",
    shikimori: OTHER_SOURCES_DISABLED ? "disabled" : "skipped",
    anidb: "skipped",
  };

  let episodeCount = 0;

  if (!OTHER_SOURCES_DISABLED) {
    try {
      const media = await getAnimeById(anime.anilistId);
      await prisma.anime.update({
        where: { id },
        data: {
          titleEnglish: media.title.english ?? anime.titleEnglish,
          titleNative: media.title.native ?? anime.titleNative,
          coverImage: media.coverImage.large ?? anime.coverImage,
          bannerImage: media.bannerImage ?? anime.bannerImage,
          description: media.description ?? anime.description,
          episodes: media.episodes ?? anime.episodes,
          status: media.status ?? anime.status,
          season: media.season ?? anime.season,
          seasonYear: media.seasonYear ?? anime.seasonYear,
          genres: media.genres.length ? media.genres.join(",") : anime.genres,
          averageScore: media.averageScore ?? anime.averageScore,
        },
      });
      status.anilist = "ok";
      anime = await prisma.anime.findUniqueOrThrow({ where: { id } });
    } catch (error) {
      console.error("Refresh AniList falhou:", error);
      status.anilist = "failed";
    }

    const episodesResult = await refetchEpisodes(anime);
    status.kitsu = episodesResult.error ? "failed" : "ok";
    episodeCount = episodesResult.episodes.length;

    try {
      const jikanMatch = await searchJikanAnime(anime.titleRomaji);
      if (jikanMatch) {
        const existingGenres = anime.genres ? anime.genres.split(",").filter(Boolean) : [];
        const delegated = await resolveIdentity({
          existingGenres,
          sourceGenres: [jikanMatch.genres],
        });
        const mergedGenres =
          (delegated?.mergedGenres as string[] | undefined) ??
          mergeGenres(existingGenres, [jikanMatch.genres]);
        await prisma.anime.update({
          where: { id },
          data: {
            malId: jikanMatch.malId,
            description: anime.description ?? jikanMatch.synopsis,
            genres: mergedGenres.join(","),
            episodes: anime.episodes ?? jikanMatch.episodes,
          },
        });
        status.jikan = "ok";
      } else {
        status.jikan = "failed";
      }
    } catch (error) {
      console.error("Refresh Jikan falhou:", error);
      status.jikan = "failed";
    }

    try {
      const shikimoriMatch = await searchShikimoriAnime(anime.titleRomaji);
      if (shikimoriMatch) {
        const existingGenres = anime.genres ? anime.genres.split(",").filter(Boolean) : [];
        const delegated = await resolveIdentity({
          existingGenres,
          sourceGenres: [shikimoriMatch.genres],
        });
        const mergedGenres =
          (delegated?.mergedGenres as string[] | undefined) ??
          mergeGenres(existingGenres, [shikimoriMatch.genres]);
        await prisma.anime.update({
          where: { id },
          data: {
            shikimoriId: shikimoriMatch.shikimoriId,
            coverImage: anime.coverImage ?? shikimoriMatch.imageUrl,
            description: anime.description ?? shikimoriMatch.description,
            episodes: anime.episodes ?? shikimoriMatch.episodes,
            genres: mergedGenres.join(","),
          },
        });
        status.shikimori = "ok";
      } else {
        status.shikimori = "failed";
      }
    } catch (error) {
      console.error("Refresh Shikimori falhou:", error);
      status.shikimori = "failed";
    }

    anime = await prisma.anime.findUniqueOrThrow({ where: { id } });
  }

  if (!anime.anidbId) {
    status.anidb = "skipped"; // sem ID da AniDB cadastrado manualmente
  } else if (!isAnidbConfigured()) {
    status.anidb = "skipped"; // sem client registrado (ANIDB_CLIENT_NAME/VERSION)
  } else {
    try {
      const anidbData = await getAnidbAnimeById(anime.anidbId);
      const delegated = await resolveIdentity({ anidbTitles: anidbData.titles });
      const picked =
        (delegated?.anidbTitle as
          | { pt: string | null; ja: string | null; en: string | null }
          | undefined) ?? pickAnidbTitles(anidbData.titles as AnidbTitleCandidate[]);

      await prisma.anime.update({
        where: { id },
        data: {
          titlePortuguese: anime.titlePortuguese ?? picked.pt ?? null,
          titleNative: anime.titleNative ?? picked.ja ?? null,
          titleEnglish: anime.titleEnglish ?? picked.en ?? null,
          description: anime.description ?? anidbData.description,
          coverImage: anime.coverImage ?? anidbData.picture,
          episodes: anime.episodes ?? anidbData.episodeCount,
          anidbRating: anidbData.rating,
          anidbVotes: anidbData.ratingVotes,
          anidbAwards: anidbData.awards.join(","),
          anidbResources: JSON.stringify(anidbData.resources),
          anidbTitles: JSON.stringify(anidbData.titles),
        },
      });

      if (anidbData.episodes.length > 0) {
        await prisma.episode.deleteMany({ where: { animeId: id } });
        await prisma.episode.createMany({
          data: anidbData.episodes.map((ep) => {
            const num = parseInt(ep.number.replace(/\D/g, ""), 10) || 0;
            return {
              animeId: id,
              number: num,
              titleRomaji:
                ep.titles.find((t) => t.language === "x-jat")?.title ??
                ep.titles.find((t) => t.language === "en")?.title ??
                null,
              titleJapanese: ep.titles.find((t) => t.language === "ja")?.title ?? null,
              airDate: ep.airDate ? new Date(ep.airDate) : null,
            };
          }),
        });
        episodeCount = anidbData.episodes.length;
      }

      status.anidb = "ok";
    } catch (error) {
      console.error("Refresh AniDB falhou:", error);
      status.anidb = "failed";
    }
  }

  await prisma.anime.update({ where: { id }, data: { lastRefreshedAt: new Date() } });

  return { status, episodeCount };
}
