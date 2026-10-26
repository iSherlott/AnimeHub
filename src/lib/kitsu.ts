import { normalizeGenres } from "@/lib/genreTaxonomy";
import { titlesLikelyMatch } from "@/lib/identityResolution";

const KITSU_API_BASE_URL =
  process.env.KITSU_API_BASE_URL ?? "https://kitsu.io/api/edge";

type KitsuTitles = {
  en?: string | null;
  en_jp?: string | null;
  ja_jp?: string | null;
};

type KitsuImage = {
  original?: string | null;
  large?: string | null;
  medium?: string | null;
  small?: string | null;
};

export type KitsuAnimeMatch = {
  kitsuId: number;
  canonicalTitle: string;
  titleJapanese: string | null;
  posterImage: string | null;
  coverImage: string | null;
  synopsis: string | null;
  episodeCount: number | null;
  startDate: string | null;
  endDate: string | null;
  genres: string[];
};

export type KitsuEpisode = {
  number: number;
  seasonNumber: number;
  titleRomaji: string | null;
  titleEnglish: string | null;
  titleJapanese: string | null;
  synopsis: string | null;
  thumbnail: string | null;
  airDate: string | null;
};

type KitsuCategoriesResponse = {
  data?: Array<{ attributes?: { title?: string | null } }>;
};

type KitsuAnimeSearchResponse = {
  data?: Array<{
    id: string;
    attributes: {
      canonicalTitle: string;
      titles?: KitsuTitles;
      posterImage?: KitsuImage;
      coverImage?: KitsuImage;
      synopsis?: string | null;
      episodeCount?: number | null;
      startDate?: string | null;
      endDate?: string | null;
    };
  }>;
};

type KitsuEpisodesResponse = {
  data?: Array<{
    attributes: {
      number: number | null;
      seasonNumber?: number | null;
      canonicalTitle?: string | null;
      titles?: KitsuTitles;
      synopsis?: string | null;
      description?: string | null;
      thumbnail?: KitsuImage;
      airdate?: string | null;
    };
  }>;
  links?: { next?: string };
};

async function kitsuFetch<T>(path: string, baseUrl: string = KITSU_API_BASE_URL): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "application/vnd.api+json" },
  });
  if (!res.ok) {
    throw new Error(`Kitsu request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/** Os dados de uma obra na Kitsu, como a API devolve (para a atualização seletiva comparar com o catálogo). */
export type KitsuAnimeDetails = {
  kitsuId: number;
  canonicalTitle: string | null;
  titles: KitsuTitles;
  synopsis: string | null;
  episodeCount: number | null;
  startDate: string | null;
  endDate: string | null;
  /** current | finished | tba | unreleased | upcoming */
  status: string | null;
  /** TV | movie | OVA | ONA | special | music */
  subtype: string | null;
  posterImage: string | null;
  coverImage: string | null;
};

type KitsuAnimeByIdResponse = {
  data?: Array<{
    id: string;
    attributes: {
      canonicalTitle?: string | null;
      titles?: KitsuTitles;
      synopsis?: string | null;
      episodeCount?: number | null;
      startDate?: string | null;
      endDate?: string | null;
      status?: string | null;
      subtype?: string | null;
      posterImage?: KitsuImage | null;
      coverImage?: KitsuImage | null;
    };
  }>;
};

/** Várias obras pelo ID da Kitsu, de 20 em 20 (o limite da página da API). A que a Kitsu não devolver fica de fora. */
export async function getKitsuAnimeByIds(ids: number[], baseUrl: string = KITSU_API_BASE_URL): Promise<KitsuAnimeDetails[]> {
  const out: KitsuAnimeDetails[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const json = await kitsuFetch<KitsuAnimeByIdResponse>(`/anime?filter[id]=${chunk.join(",")}&page[limit]=20`, baseUrl);
    for (const entry of json.data ?? []) {
      const a = entry.attributes;
      const poster = a.posterImage ?? {};
      const cover = a.coverImage ?? {};
      out.push({
        kitsuId: Number(entry.id),
        canonicalTitle: a.canonicalTitle ?? null,
        titles: a.titles ?? {},
        synopsis: a.synopsis ?? null,
        episodeCount: a.episodeCount ?? null,
        startDate: a.startDate ?? null,
        endDate: a.endDate ?? null,
        status: a.status ?? null,
        subtype: a.subtype ?? null,
        posterImage: poster.original ?? poster.large ?? poster.medium ?? null,
        coverImage: cover.original ?? cover.large ?? cover.medium ?? null,
      });
    }
  }
  return out;
}

export async function getKitsuGenres(kitsuId: number): Promise<string[]> {
  const json = await kitsuFetch<KitsuCategoriesResponse>(
    `/anime/${kitsuId}/categories?page[limit]=20`
  );
  return (json.data ?? [])
    .map((entry) => entry.attributes?.title)
    .filter((title): title is string => Boolean(title));
}

export async function searchKitsuAnime(
  title: string
): Promise<KitsuAnimeMatch | null> {
  const query = encodeURIComponent(title);
  const json = await kitsuFetch<KitsuAnimeSearchResponse>(
    `/anime?filter[text]=${query}&page[limit]=1`
  );
  const entry = json.data?.[0];
  if (!entry) return null;

  const attrs = entry.attributes;
  const titles: KitsuTitles = attrs.titles ?? {};

  // A busca por texto da Kitsu quase sempre devolve *algum* resultado,
  // mesmo sem nenhum parecido de verdade — sem checar se o 1º resultado é
  // plausivelmente o mesmo anime buscado, um título sem correspondência
  // real (nome de teste, anime obscuro) podia "casar" com um anime
  // completamente diferente e corromper capa/banner/sinopse em silêncio
  // (achado real da 6ª rodada de auditoria, Epic 18). Confere antes de
  // gastar a chamada extra de getKitsuGenres.
  if (
    !titlesLikelyMatch(title, [attrs.canonicalTitle, titles.en, titles.en_jp, titles.ja_jp])
  ) {
    return null;
  }

  const poster: KitsuImage = attrs.posterImage ?? {};
  const cover: KitsuImage = attrs.coverImage ?? {};
  // getKitsuGenres devolve as categorias cruas da Kitsu (uma taxonomia bem
  // mais granular que gênero de verdade — dezenas de tags de nicho);
  // normalizado aqui pra vocabulário fechado (ver src/lib/genreTaxonomy.ts)
  // antes de virar o campo "genres" que os chamadores dessa lib recebem.
  const genres = normalizeGenres(await getKitsuGenres(Number(entry.id)).catch(() => []));

  return {
    kitsuId: Number(entry.id),
    canonicalTitle: attrs.canonicalTitle,
    titleJapanese: titles.ja_jp ?? null,
    // `original` é a maior variante que a Kitsu expõe — igual já era feito
    // pra thumbnail de episódio logo abaixo, mas aqui a ordem estava
    // invertida (pegava `large` mesmo quando `original` existia).
    posterImage: poster.original ?? poster.large ?? poster.medium ?? null,
    coverImage: cover.original ?? cover.large ?? cover.medium ?? null,
    synopsis: attrs.synopsis ?? null,
    episodeCount: attrs.episodeCount ?? null,
    startDate: attrs.startDate ?? null,
    endDate: attrs.endDate ?? null,
    genres,
  };
}

export async function getKitsuEpisodes(
  kitsuId: number
): Promise<KitsuEpisode[]> {
  const episodes: KitsuEpisode[] = [];
  let path: string | null = `/anime/${kitsuId}/episodes?page[limit]=20&sort=number`;
  let guard = 0;

  while (path && guard < 100) {
    guard += 1;
    const json: KitsuEpisodesResponse = await kitsuFetch<KitsuEpisodesResponse>(path);

    for (const entry of json.data ?? []) {
      const attrs = entry.attributes;
      const titles: KitsuTitles = attrs.titles ?? {};
      const thumb: KitsuImage = attrs.thumbnail ?? {};
      if (attrs.number == null) continue;
      episodes.push({
        number: attrs.number,
        seasonNumber: attrs.seasonNumber ?? 1,
        // `en_jp` é o romaji de verdade (inglês transliterado do japonês);
        // `canonicalTitle` como último recurso ainda é melhor que nada
        // quando nem isso a Kitsu tem pra esse episódio específico. Antes
        // isso caía direto pra `titles.en` (o título em inglês de fato),
        // confundindo os dois campos.
        titleRomaji: titles.en_jp ?? attrs.canonicalTitle ?? null,
        titleEnglish: titles.en ?? null,
        titleJapanese: titles.ja_jp ?? null,
        synopsis: attrs.synopsis ?? attrs.description ?? null,
        thumbnail: thumb.original ?? thumb.large ?? thumb.medium ?? null,
        airDate: attrs.airdate ?? null,
      });
    }

    const next: string | undefined = json.links?.next;
    path = next ? next.replace(KITSU_API_BASE_URL, "") : null;
  }

  return episodes;
}

type KitsuMappingsResponse = {
  data?: Array<{ relationships?: { item?: { data?: { id?: string; type?: string } | null } } }>;
};

/** Base própria do job de imagens de episódios (permite apontar para uma Kitsu falsa nos testes). */
const EPISODE_IMAGES_BASE = () => process.env.EPISODE_IMAGES_KITSU_BASE_URL ?? KITSU_API_BASE_URL;

/** AniList id → Kitsu id pelo mapeamento oficial da Kitsu (exato, sem adivinhar por título). `null` = sem mapeamento. */
export async function getKitsuIdByAnilistId(anilistId: number): Promise<number | null> {
  const json = await kitsuFetch<KitsuMappingsResponse>(
    `/mappings?filter[externalSite]=anilist/anime&filter[externalId]=${anilistId}&include=item`,
    EPISODE_IMAGES_BASE()
  );
  const item = json.data?.[0]?.relationships?.item?.data;
  const id = item && item.type === "anime" ? Number(item.id) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Miniatura do episódio `number` (a Kitsu devolve uma por temporada interna; fica a primeira com imagem). */
export async function getKitsuEpisodeThumbnail(kitsuId: number, number: number): Promise<string | null> {
  const json = await kitsuFetch<KitsuEpisodesResponse>(
    `/anime/${kitsuId}/episodes?filter[number]=${number}&page[limit]=5`,
    EPISODE_IMAGES_BASE()
  );
  for (const entry of json.data ?? []) {
    const thumb: KitsuImage = entry.attributes.thumbnail ?? {};
    const url = thumb.original ?? thumb.large ?? thumb.medium ?? null;
    if (url) return url;
  }
  return null;
}
