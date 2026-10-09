import { normalizeGenres } from "@/lib/genreTaxonomy";
import type { MediaRelations } from "@/lib/franchise";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

export type AniListFuzzyDate = {
  year: number | null;
  month: number | null;
  day: number | null;
};

export type AniListMedia = {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  coverImage: {
    /** Maior variante disponível — a própria AniList já cai pra `large` no
     * servidor se um anime específico não tiver uma imagem extraLarge. */
    extraLarge: string | null;
  };
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  genres: string[];
  /** Nota média da comunidade AniList, 0-100 (mesma escala que o site deles). */
  averageScore: number | null;
  startDate: AniListFuzzyDate | null;
  endDate: AniListFuzzyDate | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  externalLinks: { site: string; url: string | null }[];
};

/** A própria AniList usa esse nome de site como convenção pro link do site
 * oficial dentro de externalLinks — não tem um `type` dedicado pra isso. */
export function getOfficialSiteUrl(media: Pick<AniListMedia, "externalLinks">): string | null {
  return media.externalLinks.find((link) => link.site === "Official Site")?.url ?? null;
}

const MEDIA_FIELDS = `
  id
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
  }
  bannerImage
  description(asHtml: false)
  episodes
  status
  season
  seasonYear
  genres
  averageScore
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  nextAiringEpisode {
    episode
    airingAt
  }
  externalLinks {
    site
    url
  }
`;

export function fuzzyDateToISO(date: AniListFuzzyDate | null): string | null {
  if (!date || !date.year) return null;
  const month = date.month ?? 1;
  const day = date.day ?? 1;
  return new Date(Date.UTC(date.year, month - 1, day)).toISOString();
}

const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_MAX_WAIT_MS = 60_000;

/** Espera sugerida após um 429: header Retry-After (segundos) ou backoff exponencial. */
export function rateLimitWaitMs(retryAfterHeader: string | null, attempt: number): number {
  const seconds = Number(retryAfterHeader);
  const suggested = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 2000 * 2 ** attempt;
  return Math.min(suggested, RATE_LIMIT_MAX_WAIT_MS);
}

async function anilistRequest<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  let res: Response;
  for (let attempt = 0; ; attempt += 1) {
    res = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: 3600 },
    });
    // 429 é transitório (limite de ~90 req/min da AniList): respeita
    // Retry-After e tenta de novo, em vez de derrubar a fatia/ciclo inteiro.
    if (res.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, rateLimitWaitMs(res.headers?.get?.("Retry-After") ?? null, attempt)));
      continue;
    }
    break;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AniList request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(
      `AniList GraphQL error: ${json.errors.map((e: { message: string }) => e.message).join(", ")}`
    );
  }
  return json.data as T;
}

/** Gêneros da AniList (e de toda outra fonte, ver src/lib/genreTaxonomy.ts)
 * chegam crus da API — normalizados aqui, no ponto em que saem desta lib,
 * pra todo consumidor (cache do catálogo, criação de anime, refresh, etc.)
 * já receber a lista fechada, sem precisar normalizar de novo. */
function normalizeMedia(media: AniListMedia): AniListMedia {
  return { ...media, genres: normalizeGenres(media.genres) };
}

export async function searchAnime(search: string): Promise<AniListMedia[]> {
  const query = `
    query ($search: String) {
      Page(perPage: 15) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const data = await anilistRequest<{ Page: { media: AniListMedia[] } }>(
    query,
    { search }
  );
  return data.Page.media.map(normalizeMedia);
}

export async function getSeasonalAnime(
  season: "WINTER" | "SPRING" | "SUMMER" | "FALL",
  seasonYear: number
): Promise<AniListMedia[]> {
  const query = `
    query ($season: MediaSeason, $seasonYear: Int) {
      Page(perPage: 24) {
        media(
          season: $season
          seasonYear: $seasonYear
          type: ANIME
          sort: POPULARITY_DESC
          format_in: [TV, TV_SHORT]
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const data = await anilistRequest<{ Page: { media: AniListMedia[] } }>(
    query,
    { season, seasonYear }
  );
  return data.Page.media.map(normalizeMedia);
}

export type AniListTrailer = { id: string; site: string } | null;

export type AniListVoiceActor = { name: string; image: string | null; language: string };

export type AniListCharacterEntry = {
  role: string;
  name: string;
  image: string | null;
  voiceActors: AniListVoiceActor[];
};

export type AniListRecommendation = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  coverImage: string | null;
};

/** Só usado pela página de detalhe (getAnimeById) — deixado fora de
 * MEDIA_FIELDS pra não pesar as buscas de lista (searchAnime,
 * getSeasonalAnime), que nunca precisam de elenco/trailer/recomendação. */
export type AniListMediaDetail = AniListMedia & {
  trailer: AniListTrailer;
  cast: AniListCharacterEntry[];
  recommendations: AniListRecommendation[];
};

const DETAIL_FIELDS = `
  trailer {
    id
    site
  }
  characters(sort: [ROLE, RELEVANCE], perPage: 12) {
    edges {
      role
      voiceActors {
        name {
          full
        }
        image {
          medium
        }
        languageV2
      }
      node {
        name {
          full
        }
        image {
          medium
        }
      }
    }
  }
  recommendations(sort: RATING_DESC, perPage: 8) {
    nodes {
      mediaRecommendation {
        id
        title {
          romaji
          english
        }
        coverImage {
          extraLarge
        }
      }
    }
  }
`;

type RawDetailFields = {
  trailer: { id: string | null; site: string | null } | null;
  characters: {
    edges: Array<{
      role: string;
      voiceActors: Array<{
        name: { full: string | null };
        image: { medium: string | null } | null;
        languageV2: string | null;
      }>;
      node: { name: { full: string | null }; image: { medium: string | null } | null } | null;
    }>;
  };
  recommendations: {
    nodes: Array<{
      mediaRecommendation: {
        id: number;
        title: { romaji: string; english: string | null };
        coverImage: { extraLarge: string | null };
      } | null;
    }>;
  };
};

/** AniList já manda o trailer com uma quebra de linha sobrando no id em
 * alguns casos (confirmado ao vivo) — sem o trim, a URL do embed do
 * YouTube fica quebrada. */
function normalizeDetailFields(raw: RawDetailFields): Pick<AniListMediaDetail, "trailer" | "cast" | "recommendations"> {
  return {
    trailer:
      raw.trailer?.id && raw.trailer.site
        ? { id: raw.trailer.id.trim(), site: raw.trailer.site }
        : null,
    cast: raw.characters.edges
      .filter((edge) => edge.node)
      .map((edge) => ({
        role: edge.role,
        name: edge.node!.name.full ?? "?",
        image: edge.node!.image?.medium ?? null,
        voiceActors: edge.voiceActors
          .filter((va) => va.name.full && va.languageV2)
          .map((va) => ({
            name: va.name.full!,
            image: va.image?.medium ?? null,
            language: va.languageV2!,
          })),
      })),
    recommendations: raw.recommendations.nodes
      .filter((n) => n.mediaRecommendation)
      .map((n) => ({
        anilistId: n.mediaRecommendation!.id,
        titleRomaji: n.mediaRecommendation!.title.romaji,
        titleEnglish: n.mediaRecommendation!.title.english,
        coverImage: n.mediaRecommendation!.coverImage.extraLarge,
      })),
  };
}

export async function getAnimeById(anilistId: number): Promise<AniListMediaDetail> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
        ${DETAIL_FIELDS}
      }
    }
  `;
  const data = await anilistRequest<{ Media: AniListMedia & RawDetailFields }>(query, {
    id: anilistId,
  });
  return { ...normalizeMedia(data.Media), ...normalizeDetailFields(data.Media) };
}

export type AniListAiringEntry = {
  anilistId: number;
  episode: number;
  airingAt: number;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  coverImage: string | null;
  bannerImage: string | null;
  genres: string[];
  description: string | null;
};

/**
 * Calendário de lançamentos — equivalente ao "simulcast calendar" da
 * Crunchyroll, só que via API pública da AniList (AiringSchedule), que
 * expõe exatamente data/hora de exibição de cada episódio. Pagina
 * automaticamente ("varredura pelas próximas páginas") até a AniList dizer
 * que não há mais itens no intervalo pedido.
 */
export async function getAiringSchedule(
  airingAtGreater: number,
  airingAtLesser: number
): Promise<AniListAiringEntry[]> {
  return (await getAiringScheduleWindow(airingAtGreater, airingAtLesser)).entries;
}

/**
 * Igual a getAiringSchedule, mas informa se a paginação foi cortada pela
 * trava de segurança (MAX_PAGES) — truncamento silencioso foi o que deixou o
 * calendário sem a semana atual (a janela larga + ordenação crescente nunca
 * chegava ao presente). Quem ingere deve fatiar a janela e registrar
 * "truncated".
 */
export async function getAiringScheduleWindow(
  airingAtGreater: number,
  airingAtLesser: number
): Promise<{ entries: AniListAiringEntry[]; truncated: boolean }> {
  const query = `
    query ($page: Int, $greater: Int, $lesser: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo {
          hasNextPage
        }
        airingSchedules(
          airingAt_greater: $greater
          airingAt_lesser: $lesser
          sort: TIME
        ) {
          episode
          airingAt
          media {
            id
            title {
              romaji
              english
              native
            }
            coverImage {
              extraLarge
            }
            bannerImage
            genres
            format
            description(asHtml: false)
          }
        }
      }
    }
  `;

  const entries: AniListAiringEntry[] = [];
  let page = 1;
  let hasNextPage = true;
  const MAX_PAGES = 10; // trava de segurança — cada página já traz 50 itens

  while (hasNextPage && page <= MAX_PAGES) {
    const data = await anilistRequest<{
      Page: {
        pageInfo: { hasNextPage: boolean };
        airingSchedules: Array<{
          episode: number;
          airingAt: number;
          media: {
            id: number;
            title: { romaji: string; english: string | null; native: string | null };
            coverImage: { extraLarge: string | null };
            bannerImage: string | null;
            genres: string[];
            format: string | null;
            description: string | null;
          };
        }>;
      };
    }>(query, { page, greater: airingAtGreater, lesser: airingAtLesser });

    for (const entry of data.Page.airingSchedules) {
      if (entry.media.format && !["TV", "TV_SHORT"].includes(entry.media.format)) {
        continue;
      }
      entries.push({
        anilistId: entry.media.id,
        episode: entry.episode,
        airingAt: entry.airingAt,
        title: entry.media.title,
        coverImage: entry.media.coverImage.extraLarge,
        bannerImage: entry.media.bannerImage,
        genres: normalizeGenres(entry.media.genres),
        description: entry.media.description,
      });
    }

    hasNextPage = data.Page.pageInfo.hasNextPage;
    page += 1;
  }

  return { entries, truncated: hasNextPage };
}

/**
 * Relações de uma mídia (PREQUEL/PARENT) — base da resolução de franquia
 * (src/lib/franchise.ts). Só mídias de anime entram; manga/novel ficam de fora.
 */
const RELATED_TYPES = new Set(["PREQUEL", "SEQUEL", "PARENT", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "SUMMARY"]);

export async function getMediaRelations(anilistId: number): Promise<MediaRelations | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        format
        title { romaji }
        relations {
          edges {
            relationType(version: 2)
            node { id type format title { romaji } }
          }
        }
      }
    }
  `;
  type Edge = { relationType: string; node: { id: number; type: string; format: string | null; title: { romaji: string } } };
  let data: { Media: { id: number; format: string | null; title: { romaji: string }; relations: { edges: Edge[] } } | null };
  try {
    data = await anilistRequest(query, { id: anilistId });
  } catch (error) {
    // 404 da AniList = id inexistente; qualquer outro erro sobe para o chamador decidir.
    if (error instanceof Error && error.message.includes("(404)")) return null;
    throw error;
  }
  if (!data.Media) return null;
  const edges = data.Media.relations.edges.filter((e) => e.node.type === "ANIME");
  const prequels = edges.filter((e) => e.relationType === "PREQUEL").map((e) => e.node.id);
  const parents = edges.filter((e) => e.relationType === "PARENT").map((e) => e.node.id);
  return {
    id: data.Media.id,
    format: data.Media.format,
    titleRomaji: data.Media.title.romaji,
    predecessorIds: prequels.length ? prequels : parents,
    related: edges
      .filter((e) => RELATED_TYPES.has(e.relationType))
      .map((e) => ({ id: e.node.id, titleRomaji: e.node.title.romaji, format: e.node.format, relationType: e.relationType })),
  };
}

export function currentSeason(date = new Date()): {
  season: "WINTER" | "SPRING" | "SUMMER" | "FALL";
  seasonYear: number;
} {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month <= 3) return { season: "WINTER", seasonYear: year };
  if (month <= 6) return { season: "SPRING", seasonYear: year };
  if (month <= 9) return { season: "SUMMER", seasonYear: year };
  return { season: "FALL", seasonYear: year };
}
