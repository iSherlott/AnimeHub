import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deriveSeriesInfo } from "@/lib/series";
import { requireUser } from "@/lib/auth/session";
import { resolveAnimeMedia, type NormalizedMedia } from "@/lib/resolveAnimeMedia";
import { callInternalService } from "@/lib/serviceDelegate";
import { extractAccentColor } from "@/lib/accentColor";
import { isValidHttpUrl } from "@/lib/url";
import { BLOCKED_CONTENT_MESSAGE, hasBlockedGenre } from "@/lib/contentPolicy";
import { isOnPlatform } from "@/lib/platform";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const animes = await prisma.anime.findMany({
    where: { userId: user.id },
    include: { platformLinks: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ animes });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido" }, { status: 400 });
  }
  const anilistId = Number(body.anilistId);

  if (!anilistId) {
    return NextResponse.json({ error: "anilistId é obrigatório" }, { status: 400 });
  }

  const existing = await prisma.anime.findUnique({
    where: { userId_anilistId: { userId: user.id, anilistId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Anime já está na sua lista" }, { status: 409 });
  }
  // Só se acompanha o que está na plataforma (trazido pelo admin).
  if (!(await isOnPlatform(anilistId))) {
    return NextResponse.json({ error: "Esta obra não faz parte da plataforma." }, { status: 403 });
  }

  const delegated = await callInternalService<NormalizedMedia>(
    process.env.CACHE_UPDATER_URL,
    "/resolve-anime",
    { anilistId }
  );

  let media: NormalizedMedia;
  if (delegated) {
    media = delegated;
  } else {
    try {
      media = await resolveAnimeMedia(anilistId);
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Falha ao buscar dados do anime (AniList fora do ar e sem cache local)" },
        { status: 502 }
      );
    }
  }

  if (hasBlockedGenre(media.genres)) {
    return NextResponse.json({ error: BLOCKED_CONTENT_MESSAGE }, { status: 403 });
  }

  const platform: string | undefined = body.platform;
  const url: string | undefined = body.url;
  // Mesma validação da rota dedicada de plataforma (isValidHttpUrl) —
  // faltava aqui, o 2º caminho de escrita pra PlatformLink (o campo
  // opcional de "onde assistir" ao adicionar direto do Descobrir), e
  // qualquer texto virava um link "clicável" quebrado na página do anime
  // (achado real da 10ª rodada de auditoria, Epic 18).
  if (url && !isValidHttpUrl(url)) {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }
  const { seriesKey, seasonNumber } = deriveSeriesInfo(media.titleRomaji);

  let anime;
  try {
    anime = await prisma.anime.create({
      data: {
        userId: user.id,
        anilistId: media.id,
        titleRomaji: media.titleRomaji,
        titleEnglish: media.titleEnglish,
        titleNative: media.titleNative,
        coverImage: media.coverImage,
        bannerImage: media.bannerImage,
        description: media.description,
        episodes: media.episodes,
        status: media.status,
        season: media.season,
        seasonYear: media.seasonYear,
        genres: media.genres,
        averageScore: media.averageScore,
        officialSite: media.officialSite,
        trailerId: media.trailerId,
        trailerSite: media.trailerSite,
        castJson: media.castJson,
        recommendationsJson: media.recommendationsJson,
        seriesKey,
        seasonNumber,
        ...(platform && url
          ? { platformLinks: { create: [{ platform, url }] } }
          : {}),
      },
      include: { platformLinks: true },
    });
  } catch (error) {
    // A checagem de duplicata acima (findUnique) não é atômica com este
    // create — 2 requisições pro mesmo anilistId quase ao mesmo tempo (ex.:
    // duplo clique, 2 abas) podem passar as duas pela checagem antes de
    // qualquer uma terminar de criar, e a 2ª bate na constraint
    // @@unique([userId, anilistId]) aqui. Sem tratar isso, virava um 500
    // cru em vez do mesmo 409 amigável que a checagem prévia já devolve
    // pro caso não-concorrente (achado real da 11ª rodada de auditoria,
    // Epic 18 — mesma família do achado alto da 8ª rodada, só que sem
    // corromper dado desta vez: a constraint segura, só a resposta que
    // ficava feia).
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "Anime já está na sua lista" }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json(
      { error: "Falha ao salvar o anime no banco de dados" },
      { status: 500 }
    );
  }

  // Cor de destaque roda em segundo plano — baixar e processar a imagem
  // não deve atrasar a resposta de "adicionar à lista".
  const animeId = anime.id;
  void extractAccentColor(media.bannerImage ?? media.coverImage)
    .then((accentColor) => {
      if (accentColor) return prisma.anime.update({ where: { id: animeId }, data: { accentColor } });
    })
    .catch((error) => console.error("Falha ao salvar cor de destaque:", error));

  return NextResponse.json({ anime }, { status: 201 });
}
