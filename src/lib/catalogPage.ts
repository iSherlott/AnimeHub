import type { Prisma } from "@prisma/client";
import { NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import { looseKey } from "@/lib/adminImport/matching";

/**
 * Consulta paginada do catálogo para o Explorar (rolagem infinita): os filtros, a busca por título e a ordenação rodam no
 * servidor, e a tela pede uma página de cada vez em vez de baixar as ~10 mil obras de uma vez. As funções aqui não tocam
 * o banco: montam o `where`/`orderBy` do Prisma e decidem quais títulos casam com a busca.
 */
export const CATALOG_PAGE_SIZE = 48;
export const CATALOG_MAX_PAGE_SIZE = 100;
const MAX_QUERY = 100;

export const CATALOG_SORTS = ["popular", "recent", "title", "year", "episodes"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export type CatalogPageParams = {
  q: string;
  genre: string;
  status: string;
  season: string;
  year: number | null;
  kind: string;
  availability: "" | "scheduled" | "unscheduled";
  sort: CatalogSort;
  offset: number;
  limit: number;
};

const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];

/** Lê e limpa os parâmetros da URL: nada que a pessoa mande derruba a consulta ou foge dos limites. */
export function parseCatalogParams(sp: URLSearchParams): CatalogPageParams {
  const text = (name: string, max: number) => (sp.get(name) ?? "").trim().slice(0, max);
  const year = Number(sp.get("year"));
  const sort = sp.get("sort") ?? "";
  const availability = sp.get("availability");
  const offset = Number(sp.get("cursor"));
  const limit = Number(sp.get("limit"));
  const season = text("season", 12).toUpperCase();
  return {
    q: text("q", MAX_QUERY),
    genre: text("genre", 60),
    status: text("status", 30),
    season: SEASONS.includes(season) ? season : "",
    year: Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : null,
    kind: text("kind", 12),
    availability: availability === "scheduled" || availability === "unscheduled" ? availability : "",
    sort: (CATALOG_SORTS as readonly string[]).includes(sort) ? (sort as CatalogSort) : "popular",
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, CATALOG_MAX_PAGE_SIZE) : CATALOG_PAGE_SIZE,
  };
}

/** Os gêneros ficam num texto "Comedy,Shounen-ai": o gênero tem de casar inteiro ("Shounen" não é "Shounen-ai"). */
export function genreWhere(genre: string): Prisma.CatalogEntryWhereInput {
  return { OR: [{ genres: genre }, { genres: { startsWith: `${genre},` } }, { genres: { endsWith: `,${genre}` } }, { genres: { contains: `,${genre},` } }] };
}

/**
 * `searchIds`: ids das obras cujo título casou com a busca (já calculados fora, ver `matchesTitleQuery`); `null` quando não
 * há busca ativa.
 */
export function catalogWhere(params: CatalogPageParams, searchIds: string[] | null): Prisma.CatalogEntryWhereInput {
  const and: Prisma.CatalogEntryWhereInput[] = [NOT_BLOCKED_GENRE];
  if (searchIds !== null) and.push({ id: { in: searchIds } });
  if (params.genre) and.push(genreWhere(params.genre));
  if (params.year !== null) and.push({ startDate: { gte: new Date(Date.UTC(params.year, 0, 1)), lt: new Date(Date.UTC(params.year + 1, 0, 1)) } });
  if (params.availability === "scheduled") and.push({ nextEpisodeAt: { not: null } });
  if (params.availability === "unscheduled") and.push({ nextEpisodeAt: null });
  return {
    onPlatform: true,
    ...(params.status ? { status: params.status } : {}),
    ...(params.season ? { season: params.season } : {}),
    ...(params.kind ? { kind: params.kind } : {}),
    AND: and,
  };
}

/** Desempate estável (título, id) em toda ordenação: as páginas nunca repetem nem pulam obra entre uma consulta e a próxima. */
export function catalogOrderBy(sort: CatalogSort): Prisma.CatalogEntryOrderByWithRelationInput[] {
  const tie: Prisma.CatalogEntryOrderByWithRelationInput[] = [{ titleRomaji: "asc" }, { id: "asc" }];
  switch (sort) {
    case "title":
      return tie;
    case "year":
      return [{ startDate: { sort: "desc", nulls: "last" } }, ...tie];
    case "episodes":
      return [{ episodes: { sort: "desc", nulls: "last" } }, ...tie];
    case "recent":
      return [{ fetchedAt: "desc" }, ...tie];
    case "popular":
    default:
      return [{ popularityRank: { sort: "asc", nulls: "last" } }, ...tie];
  }
}

/** A busca acha o trecho do título (romaji, inglês ou nativo) e também outra grafia do mesmo nome ("Bishoujyo" × "Bishoujo"). */
export function matchesTitleQuery(titles: ReadonlyArray<string | null | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return true;
  const loose = looseKey(query);
  const list = titles.filter((t): t is string => Boolean(t));
  return list.some((t) => t.toLowerCase().includes(needle)) || (loose.length >= 4 && list.some((t) => looseKey(t).includes(loose)));
}
