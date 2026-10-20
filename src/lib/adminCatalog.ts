import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CATALOG_STATUS_LABELS } from "@/lib/types";

/** Admin → Catálogo: produções primeiro, depois as obras do catálogo que ainda não têm produção, numa lista só. */
export const ADMIN_CATALOG_PAGE_SIZE = 25;
export const ADMIN_CATALOG_FORMATS = ["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"];

export type AdminCatalogRow = {
  key: string;
  production: string;
  franchise: string;
  titles: string[];
  native: string | null;
  format: string | null;
  status: string | null;
  source: string;
  identifier: string;
};

export type AdminCatalogFilters = { q: string; tipo: string; status: string; fonte: "" | "anidb" | "anilist" };

/** Lê e limpa os filtros da URL (a mesma regra para a página e para a API de rolagem). */
export function parseAdminCatalogFilters(sp: URLSearchParams | Record<string, string | undefined>): AdminCatalogFilters {
  const get = (name: string) => (sp instanceof URLSearchParams ? sp.get(name) : sp[name]) ?? "";
  const fonte = get("fonte");
  return {
    q: get("q").trim().slice(0, 80),
    tipo: ADMIN_CATALOG_FORMATS.includes(get("tipo")) ? get("tipo") : "",
    status: Object.keys(CATALOG_STATUS_LABELS).includes(get("status")) ? get("status") : "",
    fonte: fonte === "anidb" || fonte === "anilist" ? fonte : "",
  };
}

export type AdminCatalogPage = {
  rows: AdminCatalogRow[];
  productionCount: number;
  entryCount: number;
  franchiseCount: number;
  total: number;
  nextCursor: string | null;
};

/** Uma página do catálogo do admin a partir da posição `offset` (produções, e depois as obras só do catálogo). */
export async function loadAdminCatalogPage(filters: AdminCatalogFilters, offset: number, size: number = ADMIN_CATALOG_PAGE_SIZE): Promise<AdminCatalogPage> {
  const { q, tipo, status, fonte } = filters;
  const asId = /^\d{1,9}$/.test(q) ? Number(q) : null;

  const where: Prisma.ProductionWhereInput = {
    ...(tipo ? { format: tipo } : {}),
    ...(status ? { status } : {}),
    ...(fonte === "anidb" ? { anidbId: { not: null } } : {}),
    ...(q
      ? {
          OR: [
            { titleRomaji: { contains: q, mode: "insensitive" } },
            { titleEnglish: { contains: q, mode: "insensitive" } },
            { titleNative: { contains: q, mode: "insensitive" } },
            { franchise: { name: { contains: q, mode: "insensitive" } } },
            ...(asId !== null ? [{ anilistId: asId }, { anidbId: asId }] : []),
          ],
        }
      : {}),
  };

  // Obras do catálogo (AniList/AniDB) que ainda não têm produção entram DEPOIS das produções, numa única
  // lista paginada: nenhuma obra do catálogo fica de fora por causa de um limite.
  const producedIds = (await prisma.production.findMany({ select: { anilistId: true } })).map((p) => p.anilistId);
  const entryWhere: Prisma.CatalogEntryWhereInput = {
    onPlatform: true,
    ...(fonte ? { source: fonte } : {}),
    ...(status ? { status } : {}),
    AND: [
      // `NOT IN` descartaria as obras sem anilistId (NULL): elas são justamente as criadas só pelo AniDB.
      { OR: [{ anilistId: null }, { anilistId: { notIn: producedIds } }] },
      ...(q
        ? [
            {
              OR: [
                { titleRomaji: { contains: q, mode: "insensitive" as const } },
                { titleNative: { contains: q, mode: "insensitive" as const } },
                { titleEnglish: { contains: q, mode: "insensitive" as const } },
                ...(asId !== null ? [{ anilistId: asId }, { anidbId: asId }] : []),
              ],
            },
          ]
        : []),
    ],
  };
  const [productionCount, entryCount, franchiseCount] = await Promise.all([
    prisma.production.count({ where }),
    tipo ? Promise.resolve(0) : prisma.catalogEntry.count({ where: entryWhere }),
    prisma.franchise.count(),
  ]);
  const total = productionCount + entryCount;
  const productions =
    offset < productionCount
      ? await prisma.production.findMany({ where, orderBy: [{ titleRomaji: "asc" }, { id: "asc" }], skip: offset, take: size, include: { franchise: true } })
      : [];
  const entryTake = size - productions.length;
  const entries =
    tipo || entryTake <= 0
      ? []
      : await prisma.catalogEntry.findMany({ where: entryWhere, orderBy: [{ titleRomaji: "asc" }, { id: "asc" }], skip: Math.max(0, offset - productionCount), take: entryTake });

  const rows: AdminCatalogRow[] = [
    ...productions.map((p) => ({
      key: `p-${p.id}`,
      production: p.format === "MOVIE" ? "Feature film" : p.format === "OVA" ? `OVA ${p.seasonNumber}` : p.format === "SPECIAL" ? "Special" : `Season ${p.seasonNumber}`,
      franchise: `${p.franchise.name} · Franquia ${p.franchise.id.slice(-4).toUpperCase()}`,
      titles: [p.titleRomaji, p.titleEnglish].filter((t): t is string => Boolean(t) && t !== p.titleNative),
      native: p.titleNative,
      format: p.format,
      status: p.status,
      source: p.anidbId ? `AniDB #${p.anidbId}` : `AniList #${p.anilistId}`,
      identifier: `Production #${p.id.slice(-6).toUpperCase()}`,
    })),
    ...entries.map((e) => ({
      key: `e-${e.id}`,
      production: "Sem produção",
      franchise: e.source === "anidb" ? "Aguarda criação de produção" : "Catálogo da temporada · página criada ao abrir",
      titles: [e.titleRomaji, e.titleEnglish].filter((t): t is string => Boolean(t) && t !== e.titleNative),
      native: e.titleNative,
      format: null,
      status: e.status,
      source: e.anilistId ? `AniList #${e.anilistId}` : `AniDB #${e.anidbId}`,
      identifier: e.source === "anidb" ? "Importação revisada" : "Catálogo da temporada",
    })),
  ];
  const next = offset + rows.length;
  return { rows, productionCount, entryCount, franchiseCount, total, nextCursor: next < total ? String(next) : null };
}
