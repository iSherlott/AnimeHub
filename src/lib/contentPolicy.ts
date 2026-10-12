/**
 * Política de conteúdo: a plataforma não tem nenhum anime hentai. A AniList marca esse conteúdo com o gênero
 * "Hentai" (e a taxonomia fechada de gêneros o mantém). Todo ponto que traz obras de fora — busca, temporada,
 * calendário, importação, "acompanhar" — passa por aqui, e o que já existia foi removido.
 */
export const BLOCKED_GENRES: readonly string[] = ["hentai"];

/** Filtro Prisma para colunas `genres` (texto separado por vírgula): fora tudo que tenha gênero bloqueado. */
// `genres` pode ser nulo (obras sem gênero): sem o `null` explícito o NOT do Prisma as descartaria.
export const NOT_BLOCKED_GENRE = { OR: [{ genres: null }, { NOT: { genres: { contains: "hentai", mode: "insensitive" as const } } }] };

export const BLOCKED_CONTENT_MESSAGE = "Esta obra tem conteúdo adulto e não faz parte da plataforma.";

/** `genres` pode vir como lista (AniList) ou texto separado por vírgula (nossas tabelas). */
export function hasBlockedGenre(genres: readonly string[] | string | null | undefined): boolean {
  if (!genres) return false;
  const list = typeof genres === "string" ? genres.split(",") : genres;
  return list.some((g) => BLOCKED_GENRES.includes(g.trim().toLowerCase()));
}

export class BlockedContentError extends Error {
  constructor() {
    super(BLOCKED_CONTENT_MESSAGE);
    this.name = "BlockedContentError";
  }
}
