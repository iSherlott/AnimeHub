import { normalizeGenres } from "@/lib/genreTaxonomy";
import { hasBlockedGenre } from "@/lib/contentPolicy";
import type { MediaRelations } from "@/lib/franchise";

// Sobrescrevível só para os testes E2E (servidor falso); em produção é sempre a AniList.
const ANILIST_ENDPOINT = process.env.ANILIST_API_URL ?? "https://graphql.anilist.co";

export type AniListFuzzyDate = {
  year: number | null;
  month: number | null;
  day: number | null;
};

export type AniListMedia = {
  id: number;
  /** ID na MyAnimeList (chave das notícias). */
  idMal?: number | null;
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
  externalLinks: { site: string; url: string | null; type?: string | null; isDisabled?: boolean | null }[];
};

export type StreamingLink = { site: string; url: string };

/** Sites onde assistir (links `STREAMING` da AniList): só http(s), sem desativados e sem repetir o site. */
export function getStreamingLinks(media: Pick<AniListMedia, "externalLinks">): StreamingLink[] {
  const seen = new Set<string>();
  const links: StreamingLink[] = [];
  for (const link of media.externalLinks ?? []) {
    if (link.type !== "STREAMING" || link.isDisabled || !link.url || !/^https?:\/\//i.test(link.url)) continue;
    const key = link.site.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ site: link.site, url: link.url });
  }
  return links;
}

/** A própria AniList usa esse nome de site como convenção pro link do site
 * oficial dentro de externalLinks — não tem um `type` dedicado pra isso. */
export function getOfficialSiteUrl(media: Pick<AniListMedia, "externalLinks">): string | null {
  return media.externalLinks.find((link) => link.site === "Official Site")?.url ?? null;
}

const MEDIA_FIELDS = `
  id
  idMal
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
    type
    isDisabled
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
  // Conteúdo adulto (hentai) nunca entra na plataforma.
  return data.Page.media.map(normalizeMedia).filter((m) => !hasBlockedGenre(m.genres));
}

/** Formatos de uma temporada completa (TV, curtas, filmes, web, OVA e especiais); só MUSIC fica de fora. */
const SEASON_FORMATS = "[TV, TV_SHORT, MOVIE, ONA, OVA, SPECIAL]";
const SEASON_PAGE_SIZE = 50;
/** 8 × 50 = 400 obras: mais do que qualquer temporada real, e impede laço infinito. */
const SEASON_MAX_PAGES = 8;

/** Todas as obras da temporada, da mais popular para a menos (a AniList pagina em até 50). */
export async function getSeasonalAnime(
  season: "WINTER" | "SPRING" | "SUMMER" | "FALL",
  seasonYear: number,
  { includeBlocked = false }: { includeBlocked?: boolean } = {}
): Promise<AniListMedia[]> {
  const query = `
    query ($season: MediaSeason, $seasonYear: Int, $page: Int) {
      Page(page: $page, perPage: ${SEASON_PAGE_SIZE}) {
        pageInfo {
          hasNextPage
        }
        media(
          season: $season
          seasonYear: $seasonYear
          type: ANIME
          sort: POPULARITY_DESC
          format_in: ${SEASON_FORMATS}
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;
  const all: AniListMedia[] = [];
  for (let page = 1; page <= SEASON_MAX_PAGES; page += 1) {
    const data = await anilistRequest<{ Page: { pageInfo?: { hasNextPage?: boolean }; media: AniListMedia[] } }>(
      query,
      { season, seasonYear, page }
    );
    all.push(...data.Page.media.map(normalizeMedia));
    if (!data.Page.pageInfo?.hasNextPage) break;
  }
  // `includeBlocked` existe só para a importação reconhecer (e descartar) o que é hentai; nunca vai para o catálogo.
  return includeBlocked ? all : all.filter((m) => !hasBlockedGenre(m.genres));
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
const CALENDAR_FORMATS = new Set(["TV", "TV_SHORT", "ONA", "OVA", "SPECIAL", "MOVIE"]);

const AIRING_MEDIA_SELECTION = `
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
`;

type RawAiringSchedule = {
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
};

/** Mesma regra de formato e normalização para as duas buscas de calendário (janela e por obra). */
function airingEntryFromRaw(entry: RawAiringSchedule): AniListAiringEntry | null {
  // Só MUSIC (clipes) fica de fora. ONA (animes de streaming/web, ex.: Magical Explorer), OVA, especiais
  // e filmes também têm data de lançamento e precisam aparecer no calendário, como no Explorar.
  if (entry.media.format && !CALENDAR_FORMATS.has(entry.media.format)) return null;
  if (hasBlockedGenre(entry.media.genres)) return null;
  return {
    anilistId: entry.media.id,
    episode: entry.episode,
    airingAt: entry.airingAt,
    title: entry.media.title,
    coverImage: entry.media.coverImage.extraLarge,
    bannerImage: entry.media.bannerImage,
    genres: normalizeGenres(entry.media.genres),
    description: entry.media.description,
  };
}

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
        ) {${AIRING_MEDIA_SELECTION}}
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
        airingSchedules: RawAiringSchedule[];
      };
    }>(query, { page, greater: airingAtGreater, lesser: airingAtLesser });

    for (const raw of data.Page.airingSchedules) {
      const entry = airingEntryFromRaw(raw);
      if (entry) entries.push(entry);
    }

    hasNextPage = data.Page.pageInfo.hasNextPage;
    page += 1;
  }

  return { entries, truncated: hasNextPage };
}

/**
 * Todos os episódios (passados e futuros) das obras informadas — a carga manual de uma temporada anterior,
 * cujos episódios já saíram da janela de ±8 semanas do loader. `truncated` avisa se a paginação bateu no teto.
 */
export async function getAiringScheduleForMedia(mediaIds: number[]): Promise<{ entries: AniListAiringEntry[]; truncated: boolean }> {
  if (mediaIds.length === 0) return { entries: [], truncated: false };
  const query = `
    query ($page: Int, $ids: [Int]) {
      Page(page: $page, perPage: 50) {
        pageInfo {
          hasNextPage
        }
        airingSchedules(mediaId_in: $ids, sort: TIME) {${AIRING_MEDIA_SELECTION}}
      }
    }
  `;
  const entries: AniListAiringEntry[] = [];
  let page = 1;
  let hasNextPage = true;
  const MAX_PAGES = 30;
  while (hasNextPage && page <= MAX_PAGES) {
    const data = await anilistRequest<{ Page: { pageInfo: { hasNextPage: boolean }; airingSchedules: RawAiringSchedule[] } }>(query, { page, ids: mediaIds });
    for (const raw of data.Page.airingSchedules) {
      const entry = airingEntryFromRaw(raw);
      if (entry) entries.push(entry);
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
