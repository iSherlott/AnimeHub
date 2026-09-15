import { normalizeGenres } from "@/lib/genreTaxonomy";
import { titlesLikelyMatch } from "@/lib/identityResolution";

// Shikimori — API pública REST, sem chave/cadastro. Baseado só na
// documentação oficial (não deu pra testar ao vivo: o site bloqueia o
// ambiente onde este projeto foi desenvolvido com um geoblock da proteção
// deles — DDoS-Guard). Erros aqui caem no mesmo tratamento silencioso das
// outras fontes (try/catch no chamador), então uma eventual incompatibilidade
// de formato não derruba o app — só faz essa fonte específica "falhar".
const SHIKIMORI_BASE_URL =
  process.env.SHIKIMORI_API_BASE_URL ?? "https://shikimori.one/api";

// Exigido pela Shikimori — requisições sem User-Agent identificável correm
// risco de banimento de IP, segundo a documentação deles.
const USER_AGENT = "AnimeHub/1.0 (personal anime tracker)";

export type ShikimoriMatch = {
  shikimoriId: number;
  name: string;
  imageUrl: string | null;
  episodes: number | null;
  score: number | null;
  genres: string[];
  description: string | null;
};

type ShikimoriAnimeEntry = {
  id: number;
  name: string;
  image?: { original?: string | null; preview?: string | null } | null;
  episodes?: number | null;
  score?: number | string | null;
  genres?: { name: string }[];
  description?: string | null;
};

async function shikimoriFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${SHIKIMORI_BASE_URL}${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Shikimori request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function searchShikimoriAnime(title: string): Promise<ShikimoriMatch | null> {
  const list = await shikimoriFetch<ShikimoriAnimeEntry[]>(
    `/animes?search=${encodeURIComponent(title)}&limit=1`
  );
  const entry = list?.[0];
  if (!entry) return null;

  // Mesma proteção do Kitsu (ver titlesLikelyMatch) — confere antes de
  // gastar a chamada extra de detalhe.
  if (!titlesLikelyMatch(title, [entry.name])) return null;

  // busca os detalhes completos (a listagem não traz sinopse)
  const detail = await shikimoriFetch<ShikimoriAnimeEntry>(`/animes/${entry.id}`).catch(
    () => null
  );
  const source = detail ?? entry;

  const imagePath: string | null =
    source.image?.original ?? source.image?.preview ?? entry.image?.original ?? null;

  return {
    shikimoriId: entry.id,
    name: source.name ?? entry.name,
    imageUrl: imagePath ? `https://shikimori.one${imagePath}` : null,
    episodes: source.episodes ?? null,
    score: source.score != null ? Number(source.score) : null,
    genres: normalizeGenres((source.genres ?? []).map((g) => g.name)),
    description: source.description ?? null,
  };
}
