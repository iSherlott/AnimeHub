import { prisma } from "@/lib/prisma";
import { NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import { KINDS } from "@/lib/curation/kind";
import { annotateOwnership, discoverItemFromCatalogEntry, type DiscoverItem } from "@/lib/discoverItem";
import { catalogOrderBy, catalogWhere, matchesTitleQuery, parseCatalogParams } from "@/lib/catalogPage";

/**
 * Leituras do catálogo que o Explorar usa, compartilhadas entre as rotas (/api/catalog/facets, /api/catalog/page) e a
 * página renderizada no servidor — que já entrega os filtros e a primeira página prontos no HTML.
 */

const SEASON_ORDER = ["WINTER", "SPRING", "SUMMER", "FALL"];

export type CatalogFacets = { total: number; genres: Array<{ name: string; count: number }>; statuses: string[]; seasons: string[]; years: number[]; kinds: string[] };

/**
 * O que existe no catálogo para montar os filtros do Explorar sem baixar as obras: gêneros (com quantas obras cada um tem;
 * só os de 2+ obras), status, temporadas, anos e tipos. Nada de opção vazia.
 */
export async function loadCatalogFacets(): Promise<CatalogFacets> {
  const base = { onPlatform: true, ...NOT_BLOCKED_GENRE };
  const [genreRows, statusRows, seasonRows, kindRows, yearRows, total] = await Promise.all([
    prisma.catalogEntry.findMany({ where: { ...base, genres: { not: null } }, select: { genres: true } }),
    prisma.catalogEntry.groupBy({ by: ["status"], where: base }),
    prisma.catalogEntry.groupBy({ by: ["season"], where: base }),
    prisma.catalogEntry.groupBy({ by: ["kind"], where: base }),
    prisma.$queryRaw<Array<{ y: number }>>`SELECT DISTINCT EXTRACT(YEAR FROM "startDate")::int AS y FROM "CatalogEntry" WHERE "onPlatform" = true AND "startDate" IS NOT NULL ORDER BY y DESC`,
    prisma.catalogEntry.count({ where: base }),
  ]);

  const counts = new Map<string, number>();
  for (const row of genreRows) for (const genre of (row.genres ?? "").split(",")) if (genre) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  const genres = Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));

  return {
    total,
    genres,
    statuses: statusRows.map((r) => r.status).filter((s): s is string => Boolean(s)),
    seasons: SEASON_ORDER.filter((s) => seasonRows.some((r) => r.season === s)),
    years: yearRows.map((r) => r.y),
    kinds: KINDS.filter((k) => kindRows.some((r) => r.kind === k)),
  };
}

export type CatalogPageResult = { items: DiscoverItem[]; nextCursor: string | null; total: number };

/**
 * Uma página do catálogo da plataforma (rolagem infinita do Explorar). Os filtros (`genre`, `status`, `season`, `year`,
 * `kind`, `availability`), a busca por título (`q`, também por outra grafia do nome) e a ordenação (`sort`) rodam aqui; a
 * tela só pede `cursor` (a posição) e `limit`. A sinopse não vai na lista (os cartões não a usam; a prévia pede a da obra
 * que abrir), então a página pesa uma fração do catálogo inteiro.
 */
export async function loadCatalogPage(searchParams: URLSearchParams, userId: string | null): Promise<CatalogPageResult> {
  const params = parseCatalogParams(searchParams);

  let searchIds: string[] | null = null;
  if ([...params.q].length >= 2) {
    const titles = await prisma.catalogEntry.findMany({ where: { onPlatform: true }, select: { id: true, titleRomaji: true, titleEnglish: true, titleNative: true } });
    searchIds = titles.filter((t) => matchesTitleQuery([t.titleRomaji, t.titleEnglish, t.titleNative], params.q)).map((t) => t.id);
  }

  const where = catalogWhere(params, searchIds);
  const [total, rows] = await Promise.all([
    prisma.catalogEntry.count({ where }),
    prisma.catalogEntry.findMany({ where, orderBy: catalogOrderBy(params.sort), skip: params.offset, take: params.limit }),
  ]);
  const items = await annotateOwnership(
    rows.map((row) => ({ ...discoverItemFromCatalogEntry(row), description: null })),
    userId
  );
  const next = params.offset + rows.length;
  return { items, nextCursor: next < total ? String(next) : null, total };
}
