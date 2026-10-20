/**
 * Vocabulário fechado de gêneros (Epic 3, redefinido no Epic 42). Cada fonte (AniList, Kitsu, Jikan, Shikimori, AniDB) tem
 * a sua própria lista livre de gêneros/categorias/temas; em vez de mostrar esse texto cru, todo termo é mapeado para uma
 * destas 18 categorias fixas. Os nomes ficam em inglês ou em japonês romanizado (nunca traduzidos para o português).
 * Termo sem correspondência é descartado, nunca inventado.
 *
 * "Loli" só entra quando a fonte traz exatamente essa etiqueta (e nunca vinda de etiqueta adulta): nada é deduzido.
 */
export const GENRE_TAXONOMY = [
  "Mecha",
  "Adventure",
  "Drama",
  "Loli",
  "Shounen",
  "Shoujo",
  "Shounen-ai",
  "Shoujo-ai",
  "Yaoi",
  "Yuri",
  "Josei",
  "Romance",
  "Sci-fi",
  "Ecchi",
  "Isekai",
  "Slice of Life",
  "Comedy",
  "Parody",
] as const;

/**
 * Marcador interno do conteúdo adulto: NÃO é um gênero da plataforma (não aparece em filtro nem em obra), mas precisa
 * sobreviver à normalização para que a política de conteúdo (`contentPolicy`) bloqueie a obra antes de ela ser guardada.
 */
export const ADULT_MARKER = "Hentai" as const;

export type Genre = (typeof GENRE_TAXONOMY)[number] | typeof ADULT_MARKER;

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

const SYNONYMS = new Map<string, Genre>();

function register(genre: Genre, ...synonyms: string[]): void {
  for (const term of [genre, ...synonyms]) {
    SYNONYMS.set(normalizeKey(term), genre);
  }
}

register("Mecha", "Mechs", "Super Robot", "Real Robot");
register("Adventure");
register("Drama");
register("Loli");
register("Shounen", "Shonen");
register("Shoujo", "Shojo");
// MAL/Kitsu historicamente separavam "Shounen Ai" (romance leve) de "Yaoi" (conteúdo explícito) — a atualização de 2021
// do MAL fundiu o primeiro em "Boys Love", e a AniList usa a etiqueta "Boys' Love": todos mapeiam para Shounen-ai, e
// "Yaoi" fica só para o termo literal das fontes que ainda o usam (Kitsu, AniDB).
register("Shounen-ai", "Shounen Ai", "Shonen Ai", "Boys Love", "Boys' Love", "BL");
register("Shoujo-ai", "Shoujo Ai", "Shojo Ai", "Girls Love", "Girls' Love", "GL");
register("Yuri");
register("Yaoi");
register("Josei");
register("Romance");
// AniList usa "Sci-Fi", Jikan usa "Science Fiction" — os dois (e variantes de hífen/espaço) mapeiam aqui.
register("Sci-fi", "Sci-Fi", "Sci Fi", "SciFi", "Science Fiction");
register("Ecchi");
register("Isekai");
register("Slice of Life");
register("Comedy");
register("Parody");
register(ADULT_MARKER);

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

/** Etiqueta (tag) da AniList: só vale a que a fonte considera relevante para a obra e que não é adulta. */
export type AniListTag = { name: string; rank?: number | null; isAdult?: boolean | null };
const MIN_TAG_RANK = 50;

/**
 * Gêneros de uma obra da AniList: os `genres` dela mais as etiquetas relevantes (demografia, tema: Shounen, Josei, Isekai,
 * Parody, Boys' Love…). Uma etiqueta adulta nunca vira gênero; o marcador adulto só vem do gênero "Hentai" da própria obra.
 */
export function genresFromAniList(genres: string[], tags: AniListTag[] = []): Genre[] {
  const usable = tags.filter((tag) => !tag.isAdult && (tag.rank ?? 0) >= MIN_TAG_RANK).map((tag) => tag.name);
  return normalizeGenres([...genres, ...usable]);
}

/** Os gêneros que a plataforma mostra (sem o marcador interno de conteúdo adulto). */
export function visibleGenres(genres: readonly string[]): string[] {
  return genres.filter((g) => g !== ADULT_MARKER);
}
