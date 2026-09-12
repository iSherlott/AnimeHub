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
  titleJapanese: string | null;
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
      thumbnail?: KitsuImage;
      airdate?: string | null;
    };
  }>;
  links?: { next?: string };
};

async function kitsuFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${KITSU_API_BASE_URL}${path}`, {
    headers: { Accept: "application/vnd.api+json" },
  });
  if (!res.ok) {
    throw new Error(`Kitsu request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
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
  const poster: KitsuImage = attrs.posterImage ?? {};
  const cover: KitsuImage = attrs.coverImage ?? {};
  const genres = await getKitsuGenres(Number(entry.id)).catch(() => []);

  return {
    kitsuId: Number(entry.id),
    canonicalTitle: attrs.canonicalTitle,
    titleJapanese: titles.ja_jp ?? null,
    posterImage: poster.large ?? poster.medium ?? poster.original ?? null,
    coverImage: cover.large ?? cover.original ?? null,
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
        titleRomaji: attrs.canonicalTitle ?? titles.en ?? null,
        titleJapanese: titles.ja_jp ?? null,
        thumbnail: thumb.original ?? thumb.large ?? thumb.medium ?? null,
        airDate: attrs.airdate ?? null,
      });
    }

    const next: string | undefined = json.links?.next;
    path = next ? next.replace(KITSU_API_BASE_URL, "") : null;
  }

  return episodes;
}
