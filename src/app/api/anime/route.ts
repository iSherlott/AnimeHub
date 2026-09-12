import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAnimeById } from "@/lib/anilist";
import { deriveSeriesInfo } from "@/lib/series";
import { requireUser } from "@/lib/auth/session";

type NormalizedMedia = {
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
};

async function resolveMedia(anilistId: number): Promise<NormalizedMedia> {
  try {
    const media = await getAnimeById(anilistId);
    return {
      id: media.id,
      titleRomaji: media.title.romaji,
      titleEnglish: media.title.english,
      titleNative: media.title.native,
      coverImage: media.coverImage.large,
      bannerImage: media.bannerImage,
      description: media.description,
      episodes: media.episodes,
      status: media.status,
      season: media.season,
      seasonYear: media.seasonYear,
      genres: media.genres.join(","),
      averageScore: media.averageScore,
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
    };
  }
}

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

  let media: NormalizedMedia;
  try {
    media = await resolveMedia(anilistId);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Falha ao buscar dados do anime (AniList fora do ar e sem cache local)" },
      { status: 502 }
    );
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

  return NextResponse.json({ anime }, { status: 201 });
}
