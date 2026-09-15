import { prisma } from "@/lib/prisma";
import { getAnimeById, getOfficialSiteUrl } from "@/lib/anilist";
import { refetchEpisodes } from "@/lib/episodes";
import { searchJikanAnime } from "@/lib/jikan";
import { searchShikimoriAnime } from "@/lib/shikimori";
import { getAnidbAnimeById, isAnidbConfigured } from "@/lib/anidb";
import { mergeGenres, pickAnidbTitles, type AnidbTitleCandidate } from "@/lib/identityResolution";
import { callInternalService } from "@/lib/serviceDelegate";
import { extractAccentColor } from "@/lib/accentColor";
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
          coverImage: media.coverImage.extraLarge ?? anime.coverImage,
          bannerImage: media.bannerImage ?? anime.bannerImage,
          description: media.description ?? anime.description,
          episodes: media.episodes ?? anime.episodes,
          status: media.status ?? anime.status,
          season: media.season ?? anime.season,
          seasonYear: media.seasonYear ?? anime.seasonYear,
          genres: media.genres.length ? media.genres.join(",") : anime.genres,
          averageScore: media.averageScore ?? anime.averageScore,
          officialSite: getOfficialSiteUrl(media) ?? anime.officialSite,
          trailerId: media.trailer?.id ?? anime.trailerId,
          trailerSite: media.trailer?.site ?? anime.trailerSite,
          castJson: media.cast.length ? JSON.stringify(media.cast) : anime.castJson,
          recommendationsJson: media.recommendations.length
            ? JSON.stringify(media.recommendations)
            : anime.recommendationsJson,
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
        // A AniDB não traz sinopse nem miniatura por episódio — só título e
        // data. Sem preservar o que o passo da Kitsu (refetchEpisodes, logo
        // acima) já tinha acabado de gravar pro mesmo número de episódio,
        // esse deleteMany+createMany apagava esses 2 campos toda vez que o
        // anime também tinha AniDB ID vinculado (achado real da revisão de
        // código do redesenho da lista de episódios).
        //
        // A AniDB também não expõe seasonNumber (a numeração dela é única
        // por anime, sem o conceito de temporada que a Kitsu/EpisodeGrid
        // usam) — sem preservar o seasonNumber que já existia pro mesmo
        // número, esse mesmo deleteMany+createMany gravava toda temporada
        // com seasonNumber = 1 (default do schema), colapsando em silêncio
        // o agrupamento por temporada de qualquer anime multi-season que já
        // tivesse AniDB ID vinculado (achado real da 13ª rodada de
        // auditoria, Epic 18).
        //
        // O `number` da AniDB é único por anime, mas o `number` já existente
        // no banco (gravado pela Kitsu, logo acima) reinicia a cada
        // temporada — então mais de um episódio existente pode ter o mesmo
        // `number` (ex.: S1E1 e S2E1, ambos number=1). Casar só por `number`
        // não dá pra saber qual dos dois é o de verdade; guardar só "o
        // último visto" nesse caso reintroduzia exatamente o tipo de
        // atribuição errada e silenciosa que esta correção existe pra
        // evitar — quando `number` é ambíguo entre temporadas, não herda
        // nada (cai pro padrão seguro: temporada 1, sem sinopse/miniatura)
        // em vez de arriscar a temporada errada.
        const existingEpisodes = await prisma.episode.findMany({
          where: { animeId: id },
          select: { number: true, seasonNumber: true, synopsis: true, thumbnail: true },
        });
        const numberCounts = new Map<number, number>();
        for (const ep of existingEpisodes) {
          numberCounts.set(ep.number, (numberCounts.get(ep.number) ?? 0) + 1);
        }
        const existingByNumber = new Map(
          existingEpisodes.filter((ep) => numberCounts.get(ep.number) === 1).map((ep) => [ep.number, ep])
        );

        // upsert por episódio, nunca deleteMany+createMany no anime
        // inteiro: a AniDB não agrupa por temporada como a Kitsu — um
        // anidbId cobre só 1 temporada/cour, então `anidbData.episodes` é
        // só um subconjunto do que o anime pode ter. O deleteMany
        // anterior apagava TODAS as temporadas do anime antes de recriar
        // só essa (achado real da 14ª rodada de auditoria, Epic 18:
        // vincular AniDB num anime de 3 temporadas — 30 episódios — e
        // rodar "Atualizar dados" com uma AniDB de 12 episódios apagava os
        // 18 episódios das outras 2 temporadas pra sempre, não só
        // reagrupava errado). Upsert por (animeId, seasonNumber, number)
        // só cria/atualiza os episódios que a própria AniDB está
        // fornecendo dado novo, sem tocar em nenhum episódio de outra
        // temporada que ela nem menciona.
        for (const ep of anidbData.episodes) {
          const num = parseInt(ep.number.replace(/\D/g, ""), 10) || 0;
          const existing = existingByNumber.get(num);
          const seasonNumber = existing?.seasonNumber ?? 1;
          // "x-jat" (transliterado do japonês) é o romaji de verdade — sem
          // cair pra "en" aqui, que agora tem seu próprio campo
          // (titleEnglish), em vez de ser confundido com romaji quando a
          // AniDB não tem x-jat pra esse episódio.
          const titleRomaji = ep.titles.find((t) => t.language === "x-jat")?.title ?? null;
          const titleEnglish = ep.titles.find((t) => t.language === "en")?.title ?? null;
          const titleJapanese = ep.titles.find((t) => t.language === "ja")?.title ?? null;
          const airDate = ep.airDate ? new Date(ep.airDate) : null;

          await prisma.episode.upsert({
            where: { animeId_seasonNumber_number: { animeId: id, seasonNumber, number: num } },
            create: {
              animeId: id,
              number: num,
              seasonNumber,
              titleRomaji,
              titleEnglish,
              titleJapanese,
              airDate,
              synopsis: existing?.synopsis ?? null,
              thumbnail: existing?.thumbnail ?? null,
            },
            update: { titleRomaji, titleEnglish, titleJapanese, airDate },
          });
        }
        episodeCount = await prisma.episode.count({ where: { animeId: id } });
      }

      status.anidb = "ok";
    } catch (error) {
      console.error("Refresh AniDB falhou:", error);
      status.anidb = "failed";
    }
  }

  await prisma.anime.update({ where: { id }, data: { lastRefreshedAt: new Date() } });

  // Cor de destaque roda em segundo plano, depois de responder — baixar e
  // processar a imagem não deve atrasar "Atualizar dados".
  void prisma.anime
    .findUnique({ where: { id } })
    .then(async (finalAnime) => {
      if (!finalAnime) return;
      const accentColor = await extractAccentColor(finalAnime.bannerImage ?? finalAnime.coverImage);
      if (accentColor) await prisma.anime.update({ where: { id }, data: { accentColor } });
    })
    .catch((error) => console.error("Falha ao salvar cor de destaque:", error));

  return { status, episodeCount };
}
