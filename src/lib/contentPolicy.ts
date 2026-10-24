/**
 * Política de conteúdo. Até 23/10/2026 a plataforma não tinha nenhum anime hentai: tudo com o gênero "Hentai" ficava de
 * fora (busca, temporada, calendário, importação, "acompanhar"). Desde então o conteúdo adulto faz parte da plataforma como
 * uma categoria: a obra fica com o gênero "Hentai" e a página avisa que é conteúdo adulto (+18). O bloqueio antigo continua
 * aqui, desligado, atrás de `ADULT_CONTENT_BLOCKED`: todo ponto que traz obras de fora ainda passa por estas funções.
 */
export const ADULT_CONTENT_BLOCKED: boolean = false;

/** O gênero com que a AniList (e a taxonomia fechada) marca o conteúdo adulto. */
export const ADULT_GENRE = "Hentai";

export const BLOCKED_GENRES: readonly string[] = ADULT_CONTENT_BLOCKED ? ["hentai"] : [];

// `genres` pode ser nulo (obras sem gênero): sem o `null` explícito o NOT do Prisma as descartaria.
const BLOCK_FILTER = { OR: [{ genres: null }, { NOT: { genres: { contains: "hentai", mode: "insensitive" as const } } }] };

/** Filtro Prisma para colunas `genres` (texto separado por vírgula): fora tudo que tenha gênero bloqueado (nada, hoje). */
export const NOT_BLOCKED_GENRE: Partial<typeof BLOCK_FILTER> = ADULT_CONTENT_BLOCKED ? BLOCK_FILTER : {};

export const BLOCKED_CONTENT_MESSAGE = "Esta obra tem conteúdo adulto e não faz parte da plataforma.";

const genreList = (genres: readonly string[] | string | null | undefined): string[] =>
  !genres ? [] : (typeof genres === "string" ? genres.split(",") : [...genres]).map((g) => g.trim().toLowerCase());

/** `genres` pode vir como lista (AniList) ou texto separado por vírgula (nossas tabelas). */
export function hasBlockedGenre(genres: readonly string[] | string | null | undefined): boolean {
  return genreList(genres).some((g) => BLOCKED_GENRES.includes(g));
}

/** A obra é conteúdo adulto (tem o gênero "Hentai"): a página mostra o aviso de +18. */
export function isAdultContent(genres: readonly string[] | string | null | undefined): boolean {
  return genreList(genres).includes(ADULT_GENRE.toLowerCase());
}

export class BlockedContentError extends Error {
  constructor() {
    super(BLOCKED_CONTENT_MESSAGE);
    this.name = "BlockedContentError";
  }
}
