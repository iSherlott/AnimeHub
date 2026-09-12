// Jikan (jikan.moe) é uma API REST gratuita e pública que espelha os dados
// abertos do MyAnimeList — não é scraping: é a forma padrão da comunidade
// de acessar dados do MAL sem precisar de OAuth. Tem rate limit generoso
// (~3 req/s), então usamos só quando o usuário pede um refresh manual.
const JIKAN_BASE_URL = process.env.JIKAN_API_BASE_URL ?? "https://api.jikan.moe/v4";

export type JikanAnimeMatch = {
  malId: number;
  synopsis: string | null;
  genres: string[];
  score: number | null;
  episodes: number | null;
};

type JikanSearchResponse = {
  data?: Array<{
    mal_id: number;
    synopsis?: string | null;
    genres?: { name: string }[];
    themes?: { name: string }[];
    score?: number | null;
    episodes?: number | null;
  }>;
};

async function jikanFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${JIKAN_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Jikan request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function searchJikanAnime(title: string): Promise<JikanAnimeMatch | null> {
  const json = await jikanFetch<JikanSearchResponse>(
    `/anime?q=${encodeURIComponent(title)}&limit=1`
  );
  const entry = json.data?.[0];
  if (!entry) return null;

  return {
    malId: entry.mal_id,
    synopsis: entry.synopsis ?? null,
    genres: [...(entry.genres ?? []), ...(entry.themes ?? [])].map((g) => g.name),
    score: entry.score ?? null,
    episodes: entry.episodes ?? null,
  };
}
