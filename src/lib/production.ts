import type { Franchise, Production } from "@prisma/client";
import { catalogEntryIdFor } from "@/lib/catalogLink";
import { prisma } from "@/lib/prisma";
import {
  getAnimeById,
  getMediaRelations,
  getOfficialSiteUrl,
  getStreamingLinks,
  type AniListMedia,
} from "@/lib/anilist";
import { resolveFranchise, type MediaRelations } from "@/lib/franchise";
import { hasBlockedGenre } from "@/lib/contentPolicy";
import { isOnPlatform } from "@/lib/platform";
import { reapplyLinksFor } from "@/lib/workLinks";

/**
 * Produção canônica compartilhada (D-03/D-18) — base do detalhe público.
 * Criada sob demanda (primeira visita) a partir da AniList; se a AniList
 * estiver fora, cai no cache local (CatalogEntry / AiringScheduleEntry).
 */

export type ProductionWithFranchise = Production & { franchise: Franchise };

const REFRESH_AFTER_MS = 7 * 24 * 3600 * 1000;

/** `anidbId` fica de fora: é vinculado pela importação revisada e a atualização via AniList não pode apagá-lo. */
export type ProductionFields = Omit<Production, "id" | "franchiseId" | "anidbId" | "titleLocked" | "catalogEntryId" | "createdAt" | "fetchedAt" | "updatedAt">;

export function productionFieldsFromMedia(
  media: AniListMedia,
  relations: Pick<MediaRelations, "format" | "related"> | null,
  seasonNumber: number
): ProductionFields {
  return {
    anilistId: media.id,
    seasonNumber,
    format: relations?.format ?? null,
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
    officialSite: getOfficialSiteUrl(media),
    streamingLinksJson: JSON.stringify(getStreamingLinks(media)),
    relationsJson: relations?.related?.length ? JSON.stringify(relations.related) : null,
  };
}

async function upsertFranchise(rootAnilistId: number, name: string): Promise<Franchise> {
  return prisma.franchise.upsert({
    where: { rootAnilistId },
    create: { rootAnilistId, name },
    update: {},
  });
}

/** Junta duas listas de "onde assistir": a primeira manda; da segunda entram só os sites que faltam. */
export function mergeStreamingLinks(primary: Array<{ site: string; url: string }>, extra: Array<{ site: string; url: string }>): Array<{ site: string; url: string }> {
  const seen = new Set(primary.map((l) => l.site.toLowerCase()));
  const merged = [...primary];
  for (const link of extra) {
    const key = link.site.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(link);
  }
  return merged;
}

async function fromAniList(anilistId: number): Promise<ProductionWithFranchise | null> {
  const cache = new Map<number, MediaRelations | null>();
  const fetchRelations = async (id: number) => {
    if (!cache.has(id)) cache.set(id, await getMediaRelations(id));
    return cache.get(id) ?? null;
  };

  const media = await getAnimeById(anilistId).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes("(404)")) return null;
    throw error;
  });
  if (!media) return null;
  if (hasBlockedGenre(media.genres)) return null; // conteúdo adulto não entra na plataforma

  const resolution = await resolveFranchise(anilistId, fetchRelations);
  const franchise = await upsertFranchise(
    resolution.rootId,
    resolution.rootTitleRomaji || media.title.romaji
  );
  const fields = productionFieldsFromMedia(media, cache.get(anilistId) ?? null, resolution.seasonNumber);
  // Sites que vieram de outra fonte (importação do AniDB) sobrevivem à atualização pela AniList.
  const prior = await prisma.production.findUnique({ where: { anilistId }, select: { streamingLinksJson: true, titleLocked: true, titleRomaji: true } });
  if (prior?.titleLocked) fields.titleRomaji = prior.titleRomaji; // título fixado (o do AniDB): a AniList não troca
  fields.streamingLinksJson = JSON.stringify(mergeStreamingLinks(getStreamingLinks(media), parseStreamingLinks(prior?.streamingLinksJson ?? null)));
  const catalogEntryId = await catalogEntryIdFor(anilistId);
  const production = await prisma.production.upsert({
    where: { anilistId },
    create: { ...fields, franchiseId: franchise.id, catalogEntryId },
    update: { ...fields, franchiseId: franchise.id, fetchedAt: new Date(), ...(catalogEntryId ? { catalogEntryId } : {}) },
    include: { franchise: true },
  });
  // A AniList refez a franquia pelas relações dela: as continuações que o admin ligou à mão voltam a valer.
  await reapplyLinksFor(anilistId);
  return (await prisma.production.findUnique({ where: { anilistId }, include: { franchise: true } })) ?? production;
}

async function fromLocalCache(anilistId: number): Promise<ProductionWithFranchise | null> {
  const [catalog, airing] = await Promise.all([
    prisma.catalogEntry.findUnique({ where: { anilistId } }),
    prisma.airingScheduleEntry.findFirst({ where: { anilistId }, orderBy: { airingAt: "desc" } }),
  ]);
  const src = catalog ?? airing;
  if (!src || hasBlockedGenre(src.genres)) return null;
  const franchise = await upsertFranchise(anilistId, src.titleRomaji);
  return prisma.production.upsert({
    where: { anilistId },
    create: {
      anilistId,
      catalogEntryId: catalog?.id ?? null,
      franchiseId: franchise.id,
      titleRomaji: src.titleRomaji,
      titleEnglish: src.titleEnglish,
      titleNative: src.titleNative,
      coverImage: src.coverImage,
      bannerImage: src.bannerImage,
      description: src.description,
      genres: src.genres,
      episodes: catalog?.episodes ?? null,
      status: catalog?.status ?? null,
      season: catalog?.season ?? null,
      seasonYear: catalog?.seasonYear ?? null,
    },
    update: {},
    include: { franchise: true },
  });
}

/** Devolve a produção (criando/atualizando sob demanda) ou null se não existir em lugar nenhum. */
export async function ensureProduction(anilistId: number): Promise<ProductionWithFranchise | null> {
  const existing = await prisma.production.findUnique({
    where: { anilistId },
    include: { franchise: true },
  });
  // `streamingLinksJson === null` = produção criada antes de existir "Onde assistir": consulta uma vez.
  if (existing && existing.streamingLinksJson !== null && Date.now() - existing.fetchedAt.getTime() < REFRESH_AFTER_MS) return existing;
  // Obra que não faz parte da plataforma não ganha produção só por alguém abrir o endereço dela.
  if (!existing && !(await isOnPlatform(anilistId))) return null;

  try {
    const fresh = await fromAniList(anilistId);
    if (fresh) return fresh;
    return existing; // AniList disse "não existe": mantém o que já tínhamos, se houver
  } catch (error) {
    console.error(`[production] AniList indisponível para ${anilistId}:`, error);
    return existing ?? (await fromLocalCache(anilistId));
  }
}

export type RelatedProduction = { id: number; titleRomaji: string; format: string | null; relationType: string };

export function parseRelations(json: string | null): RelatedProduction[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as RelatedProduction[]) : [];
  } catch {
    return [];
  }
}

/** Lê o JSON salvo em `Production.streamingLinksJson` (inválido/ausente = nenhum link). */
export function parseStreamingLinks(json: string | null): Array<{ site: string; url: string }> {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? (parsed as Array<{ site?: unknown; url?: unknown }>)
          .filter((l): l is { site: string; url: string } => typeof l.site === "string" && typeof l.url === "string" && /^https?:\/\//i.test(l.url))
      : [];
  } catch {
    return [];
  }
}
