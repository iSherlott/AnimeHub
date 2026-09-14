/**
 * Vocabulário fechado de gêneros (Epic 3) — cada fonte (AniList, Kitsu,
 * Jikan, Shikimori) tem sua própria lista livre de gêneros/categorias/temas,
 * com nomes e granularidade diferentes entre si (Kitsu em particular tem
 * dezenas de tags de nicho). Em vez de mostrar esse texto cru, todo gênero
 * é mapeado pra uma destas 18 categorias fixas — termo sem mapeamento
 * correspondente é descartado, não inventado.
 *
 * Lista definida pelo próprio backlog, sem "Action"/"Drama"/"Fantasy" etc.
 * apesar de serem comuns nas fontes — decisão confirmada explicitamente ao
 * ser perguntado, não uma omissão.
 */
export const GENRE_TAXONOMY = [
  "Comedy",
  "Romance",
  "Supernatural",
  "Slice of Life",
  "Mecha",
  "Shounen",
  "Shoujo",
  "Shounen-ai",
  "Shoujo-ai",
  "Yuri",
  "Yaoi",
  "Adventure",
  "Isekai",
  "Ecchi",
  "Hentai",
  "Parody",
  "Sci-fi",
  "Seinen",
] as const;

export type Genre = (typeof GENRE_TAXONOMY)[number];

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

const SYNONYMS = new Map<string, Genre>();

function register(genre: Genre, ...synonyms: string[]): void {
  for (const term of [genre, ...synonyms]) {
    SYNONYMS.set(normalizeKey(term), genre);
  }
}

register("Comedy");
register("Romance");
register("Supernatural");
register("Slice of Life");
register("Mecha", "Mechs");
register("Shounen", "Shonen");
register("Shoujo", "Shojo");
// MAL/Kitsu historicamente separavam "Shounen Ai" (romance leve) de "Yaoi"
// (conteúdo explícito) — a atualização de 2021 do MAL fundiu o primeiro em
// "Boys Love", termo que mapeia aqui pro equivalente mais próximo
// (Shounen-ai), deixando "Yaoi" só pro termo literal das fontes que ainda o
// usam (ex.: Kitsu, AniDB).
register("Shounen-ai", "Shounen Ai", "Shonen Ai", "Boys Love", "BL");
register("Shoujo-ai", "Shoujo Ai", "Shojo Ai", "Girls Love", "GL");
register("Yuri");
register("Yaoi");
register("Adventure");
register("Isekai");
register("Ecchi");
register("Hentai");
register("Parody");
// Exemplo do próprio backlog: AniList usa "Sci-Fi", Jikan usa
// "Science Fiction" — os dois (e variantes de hífen/espaço) mapeiam aqui.
register("Sci-fi", "Sci-Fi", "Sci Fi", "SciFi", "Science Fiction");
register("Seinen");

/** `null` quando o termo não tem correspondente na taxonomia fechada — nesse
 * caso o chamador deve descartar o termo, nunca inventar uma categoria. */
export function normalizeGenre(raw: string): Genre | null {
  return SYNONYMS.get(normalizeKey(raw)) ?? null;
}

/** Mapeia, descarta o que não bate e remove duplicatas — preserva a ordem
 * da primeira ocorrência de cada categoria. */
export function normalizeGenres(raw: string[]): Genre[] {
  const seen = new Set<Genre>();
  for (const term of raw) {
    const mapped = normalizeGenre(term);
    if (mapped) seen.add(mapped);
  }
  return Array.from(seen);
}
