import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveSeriesInfo } from "@/lib/series";
import { requireUser } from "@/lib/auth/session";
import { resolveAnimeMedia, type NormalizedMedia } from "@/lib/resolveAnimeMedia";
import { callInternalService } from "@/lib/serviceDelegate";
import { extractAccentColor } from "@/lib/accentColor";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const animes = await prisma.anime.findMany({
    where: { userId: user.id },
    include: { platformLinks: true, progress: true },
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

  const platform: string | undefined = body.platform;
  const url: string | undefined = body.url;
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
        progress: {
          create: { status: "PLAN_TO_WATCH", episodeProgress: 0 },
        },
        ...(platform && url
          ? { platformLinks: { create: [{ platform, url }] } }
          : {}),
      },
      include: { platformLinks: true, progress: true },
    });
  } catch (error) {
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
