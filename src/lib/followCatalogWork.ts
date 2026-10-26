import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deriveSeriesInfo } from "@/lib/series";
import { BLOCKED_CONTENT_MESSAGE, hasBlockedGenre } from "@/lib/contentPolicy";
import { CATALOG_ONLY_SLUG } from "@/lib/workHref";

export type FollowCatalogResult =
  | { ok: true; anime: Prisma.AnimeGetPayload<{ include: { platformLinks: true } }> }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string; anilistId?: number };

/**
 * Acompanhar uma obra sem AniList ID (só do AniDB ou da Kitsu), pela chave `anidb-<id>`/`kitsu-<id>`. A identidade do
 * item de lista é a obra do catálogo (`@@unique([userId, catalogEntryId])`) e os dados vêm do catálogo — não há AniList
 * para consultar. Só o que está na plataforma. Se a obra já foi ligada à AniList, devolve o AniList ID para o fluxo normal.
 */
export async function followCatalogWork(userId: string, work: string, link?: { platform: string; url: string }): Promise<FollowCatalogResult> {
  const match = CATALOG_ONLY_SLUG.exec(work);
  if (!match || Number(match[2]) <= 0) return { ok: false, status: 400, error: "Obra inválida." };
  const sourceId = Number(match[2]);
  const entry = await prisma.catalogEntry.findUnique({ where: match[1] === "anidb" ? { anidbId: sourceId } : { kitsuId: sourceId } });
  if (!entry) return { ok: false, status: 404, error: "Obra não encontrada." };
  if (!entry.onPlatform) return { ok: false, status: 403, error: "Esta obra não faz parte da plataforma." };
  if (entry.anilistId !== null) return { ok: false, status: 409, error: "A obra foi ligada à AniList.", anilistId: entry.anilistId };
  if (hasBlockedGenre(entry.genres)) return { ok: false, status: 403, error: BLOCKED_CONTENT_MESSAGE };

  const existing = await prisma.anime.findUnique({ where: { userId_catalogEntryId: { userId, catalogEntryId: entry.id } }, select: { id: true } });
  if (existing) return { ok: false, status: 409, error: "Anime já está na sua lista" };

  const { seriesKey, seasonNumber } = deriveSeriesInfo(entry.titleRomaji);
  try {
    const anime = await prisma.anime.create({
      data: {
        userId,
        anilistId: null,
        catalogEntryId: entry.id,
        anidbId: entry.anidbId,
        kitsuId: entry.kitsuId,
        titleRomaji: entry.titleRomaji,
        titleEnglish: entry.titleEnglish,
        titleNative: entry.titleNative,
        coverImage: entry.coverImage,
        bannerImage: entry.bannerImage,
        description: entry.description,
        episodes: entry.episodes,
        format: entry.format,
        status: entry.status,
        season: entry.season,
        seasonYear: entry.seasonYear,
        genres: entry.genres ?? "",
        officialSite: entry.officialSite,
        seriesKey,
        seasonNumber,
        ...(link ? { platformLinks: { create: [link] } } : {}),
      },
      include: { platformLinks: true },
    });
    return { ok: true, anime };
  } catch (error) {
    // Duas requisições ao mesmo tempo (duplo clique, duas abas): a segunda bate na unicidade e vira o mesmo 409.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, status: 409, error: "Anime já está na sua lista" };
    throw error;
  }
}
