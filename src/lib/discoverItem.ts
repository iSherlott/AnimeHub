import type { CatalogEntry } from "@prisma/client";
import { fuzzyDateToISO, type AniListMedia } from "@/lib/anilist";
import { prisma } from "@/lib/prisma";
import { classifyKind } from "@/lib/curation/kind";

export type DiscoverItem = {
  key: string;
  anilistId: number | null;
  /** Só vem preenchido quando a entrada é de origem Kitsu (sem anilistId) —
   * annotateOwnership precisa dele pra achar posse desses itens também,
   * já que o Anime do usuário pode ter só um dos dois IDs preenchido. */
  kitsuId: number | null;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  genres: string[];
  status: string | null;
  /** Tipo da obra: TV, TV_SHORT, MOVIE, OVA, ONA, SPECIAL, MUSIC (nulo = ainda não conhecido). */
  format?: string | null;
  /** Tipo na linha da história (curadoria): EPISODE, OVA, ODA, MOVIE ou OTHER (nulo = ainda não classificado). */
  kind?: string | null;
  season: string | null;
  startDate: string | null;
  endDate: string | null;
  nextEpisodeNumber: number | null;
  nextEpisodeAt: string | null;
  popularityRank: number | null;
  cached: boolean;
  /** Preenchido só na camada de rota do BFF (annotateOwnership), nunca nos
   * mapeadores abaixo — eles também rodam dentro do serviço cache-updater,
   * que não tem acesso à sessão de um usuário específico. */
  inMyList: boolean;
  animeId: string | null;
  /** Só no "Em destaque" do Explorar: o episódio de `nextEpisodeAt` é o de HOJE (mesmo que já tenha ido ao ar). */
  airingToday?: boolean;
};

export function discoverItemFromAniList(media: AniListMedia): DiscoverItem {
  return {
    key: `anilist-${media.id}`,
    anilistId: media.id,
    kitsuId: null,
    titleRomaji: media.title.romaji,
    titleEnglish: media.title.english,
    titleNative: media.title.native,
    coverImage: media.coverImage.extraLarge,
    bannerImage: media.bannerImage,
    description: media.description,
    episodes: media.episodes,
    genres: media.genres,
    status: media.status,
    format: media.format ?? null,
    kind: classifyKind({ format: media.format, title: media.title.romaji }),
    season: media.season,
    startDate: fuzzyDateToISO(media.startDate),
    endDate: fuzzyDateToISO(media.endDate),
    nextEpisodeNumber: media.nextAiringEpisode?.episode ?? null,
    nextEpisodeAt: media.nextAiringEpisode
      ? new Date(media.nextAiringEpisode.airingAt * 1000).toISOString()
      : null,
    popularityRank: null,
    cached: false,
    inMyList: false,
    animeId: null,
  };
}

export function discoverItemFromCatalogEntry(
  entry: CatalogEntry
): DiscoverItem {
  return {
    key: entry.anilistId ? `anilist-${entry.anilistId}` : entry.kitsuId ? `kitsu-${entry.kitsuId}` : `anidb-${entry.anidbId}`,
    anilistId: entry.anilistId,
    kitsuId: entry.kitsuId,
    titleRomaji: entry.titleRomaji,
    titleEnglish: entry.titleEnglish,
    titleNative: entry.titleNative,
    coverImage: entry.coverImage,
    bannerImage: entry.bannerImage,
    description: entry.description,
    episodes: entry.episodes,
    genres: entry.genres ? entry.genres.split(",").filter(Boolean) : [],
    status: entry.status,
    format: entry.format,
    kind: entry.kind,
    season: entry.season,
    startDate: entry.startDate ? entry.startDate.toISOString() : null,
    endDate: entry.endDate ? entry.endDate.toISOString() : null,
    nextEpisodeNumber: entry.nextEpisodeNumber,
    nextEpisodeAt: entry.nextEpisodeAt ? entry.nextEpisodeAt.toISOString() : null,
    popularityRank: entry.popularityRank,
    cached: true,
    inMyList: false,
    animeId: null,
  };
}

/**
 * Completa o próximo episódio pela agenda global (a mesma do Calendário, ADR 0009: AniList, Kitsu, AniDB e ajustes do
 * admin) quando o item não traz um futuro — senão a temporada dizia "Data não definida" para um anime que o
 * Calendário mostra com horário.
 */
export async function withGlobalSchedule(items: DiscoverItem[], now: Date = new Date()): Promise<DiscoverItem[]> {
  const missing = [...new Set(items.flatMap((i) => (i.anilistId != null && !(i.nextEpisodeAt && new Date(i.nextEpisodeAt).getTime() >= now.getTime()) ? [i.anilistId] : [])))];
  if (missing.length === 0) return items;
  const rows = await prisma.airingScheduleEntry.findMany({
    where: { anilistId: { in: missing }, status: "ACTIVE", airingAt: { gte: now } },
    orderBy: { airingAt: "asc" },
    select: { anilistId: true, episode: true, airingAt: true },
  });
  const next = new Map<number, { episode: number; airingAt: Date }>();
  for (const r of rows) if (r.anilistId !== null && r.airingAt && !next.has(r.anilistId)) next.set(r.anilistId, { episode: r.episode, airingAt: r.airingAt });
  if (next.size === 0) return items;
  return items.map((i) => {
    const n = i.anilistId != null && missing.includes(i.anilistId) ? next.get(i.anilistId) : undefined;
    return n ? { ...i, nextEpisodeAt: n.airingAt.toISOString(), nextEpisodeNumber: n.episode } : i;
  });
}

/**
 * Anota cada item com "já está na minha lista?" pro usuário atual — só
 * roda na camada de rota do BFF (nunca dentro do cache-updater, que não
 * tem sessão de usuário nenhuma), depois que os itens já vieram prontos
 * de qualquer fonte (delegado ao serviço ou fallback local). Antes, completa
 * o próximo episódio pela agenda global (`withGlobalSchedule`): todas as
 * listas de obras passam por aqui.
 */
export async function annotateOwnership(
  rawItems: DiscoverItem[],
  userId: string | null
): Promise<DiscoverItem[]> {
  const items = await withGlobalSchedule(rawItems);
  if (!userId) return items;

  const anilistIds = items
    .map((item) => item.anilistId)
    .filter((id): id is number => id != null);
  // Item de origem Kitsu (sem anilistId) só pode ser cruzado contra o Anime
  // do usuário pelo kitsuId — sem isso, todo item vindo do catálogo local
  // via Kitsu nunca aparece como "já na lista", mesmo quando está.
  const kitsuIds = items
    .map((item) => item.kitsuId)
    .filter((id): id is number => id != null);
  // Obra só do AniDB (sem AniList ID nem Kitsu): a chave do cartão é `anidb-<id>`, e o item da lista guarda o anidbId.
  const anidbIds = items.flatMap((item) => {
    const m = item.anilistId == null && item.kitsuId == null ? /^anidb-(\d+)$/.exec(item.key) : null;
    return m ? [Number(m[1])] : [];
  });
  if (anilistIds.length === 0 && kitsuIds.length === 0 && anidbIds.length === 0) return items;

  const owned = await prisma.anime.findMany({
    where: {
      userId,
      OR: [
        ...(anilistIds.length ? [{ anilistId: { in: anilistIds } }] : []),
        ...(kitsuIds.length ? [{ kitsuId: { in: kitsuIds } }] : []),
        ...(anidbIds.length ? [{ anilistId: null, anidbId: { in: anidbIds } }] : []),
      ],
    },
    select: { id: true, anilistId: true, kitsuId: true, anidbId: true },
  });
  const ownedByAnilistId = new Map(
    owned.filter((a) => a.anilistId != null).map((a) => [a.anilistId, a.id])
  );
  const ownedByKitsuId = new Map(
    owned.filter((a) => a.kitsuId != null).map((a) => [a.kitsuId, a.id])
  );
  const ownedByAnidbKey = new Map(owned.filter((a) => a.anilistId == null && a.anidbId != null).map((a) => [`anidb-${a.anidbId}`, a.id]));

  return items.map((item) => {
    const animeId =
      (item.anilistId != null ? ownedByAnilistId.get(item.anilistId) : undefined) ??
      (item.kitsuId != null ? ownedByKitsuId.get(item.kitsuId) : undefined) ??
      ownedByAnidbKey.get(item.key);
    return animeId ? { ...item, inMyList: true, animeId } : item;
  });
}
