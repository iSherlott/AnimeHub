import { normalizeGenres } from "@/lib/genreTaxonomy";
import { titlesLikelyMatch } from "@/lib/identityResolution";

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
    title?: string | null;
    title_english?: string | null;
    title_japanese?: string | null;
    synopsis?: string | null;
    genres?: { name: string }[];
    themes?: { name: string }[];
    // MAL's 2021 taxonomy restructuring split these into their own
    // top-level arrays — "demographics" is where Shounen/Shoujo/Seinen
    // actually live (never in `genres` or `themes`), and "explicit_genres"
    // is where Hentai/Yaoi/Yuri live. Confirmed live against the real API
    // (One Piece: demographics: [{name: "Shounen"}]) — missing these meant
    // 3 of the 18 taxonomy categories could never be reached via Jikan.
    demographics?: { name: string }[];
    explicit_genres?: { name: string }[];
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

  // Mesma proteção do Kitsu (ver titlesLikelyMatch) — a busca da Jikan
  // também quase sempre devolve algum resultado, relevante ou não.
  if (!titlesLikelyMatch(title, [entry.title, entry.title_english, entry.title_japanese])) {
    return null;
  }

  return {
    malId: entry.mal_id,
    synopsis: entry.synopsis ?? null,
    genres: normalizeGenres(
      [
        ...(entry.genres ?? []),
        ...(entry.themes ?? []),
        ...(entry.demographics ?? []),
        ...(entry.explicit_genres ?? []),
      ].map((g) => g.name)
    ),
    score: entry.score ?? null,
    episodes: entry.episodes ?? null,
  };
}
