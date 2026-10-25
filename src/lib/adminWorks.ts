import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FORMATS, SEASONS, STATUSES } from "@/lib/catalogEdit";

/**
 * Admin → Catálogo de obras (Fase 3): a lista canônica (`CatalogEntry`), paginada e filtrada no servidor. Os filtros de
 * qualidade vêm das mesmas regras do painel de saúde, então um indicador leva a esta lista já filtrada.
 */
export const WORKS_PAGE_SIZE = 50;

export const QUALITY_FILTERS = {
  "sem-sinopse": { label: "Sem sinopse", where: { description: null, descriptionPt: null } },
  "sem-traducao": { label: "Sinopse sem português", where: { description: { not: null }, descriptionPt: null } },
  "sem-genero": { label: "Sem gênero", where: { genres: null } },
  "sem-titulo-ja": { label: "Sem título japonês", where: { titleNative: null } },
  "sem-capa": { label: "Sem capa", where: { coverImage: null } },
  "sem-site": { label: "Sem site oficial", where: { officialSite: null } },
  "sem-tipo": { label: "Sem formato ou tipo", where: { OR: [{ format: null }, { kind: null }] } },
  "sem-ano": { label: "Sem ano", where: { seasonYear: null, startDate: null } },
  "sem-franquia": { label: "Série fora de linha do tempo", where: { kind: "EPISODE", franchiseKey: null, anilistId: { not: null } } },
  "protegida": { label: "Com campo corrigido à mão", where: { NOT: { manualFields: { isEmpty: true } } } },
} satisfies Record<string, { label: string; where: Prisma.CatalogEntryWhereInput }>;
export type QualityFilter = keyof typeof QUALITY_FILTERS;

export type WorksFilters = {
  q: string;
  formato: string;
  situacao: string;
  ano: string;
  temporada: string;
  fonte: "" | "anilist" | "anidb" | "sem-anilist";
  visibilidade: "" | "plataforma" | "cache";
  pendencias: "" | "com" | "sem";
  qualidade: "" | QualityFilter;
  pagina: number;
};

export function parseWorksFilters(sp: URLSearchParams | Record<string, string | undefined>): WorksFilters {
  const get = (name: string) => ((sp instanceof URLSearchParams ? sp.get(name) : sp[name]) ?? "").trim();
  const oneOf = <T extends string>(value: string, list: readonly T[]): T | "" => ((list as readonly string[]).includes(value) ? (value as T) : "");
  const ano = /^\d{4}$/.test(get("ano")) ? get("ano") : "";
  return {
    q: get("q").slice(0, 80),
    formato: oneOf(get("formato"), FORMATS),
    situacao: oneOf(get("situacao"), STATUSES),
    ano,
    temporada: oneOf(get("temporada"), SEASONS),
    fonte: oneOf(get("fonte"), ["anilist", "anidb", "sem-anilist"] as const),
    visibilidade: oneOf(get("visibilidade"), ["plataforma", "cache"] as const),
    pendencias: oneOf(get("pendencias"), ["com", "sem"] as const),
    qualidade: oneOf(get("qualidade"), Object.keys(QUALITY_FILTERS) as QualityFilter[]),
    pagina: Math.max(0, Math.min(10_000, Number(get("pagina")) || 0)),
  };
}

export function worksWhere(f: WorksFilters): Prisma.CatalogEntryWhereInput {
  const asId = /^\d{1,9}$/.test(f.q) ? Number(f.q) : null;
  const and: Prisma.CatalogEntryWhereInput[] = [];
  if (f.q) {
    and.push({
      OR: [
        { titleRomaji: { contains: f.q, mode: "insensitive" } },
        { titleEnglish: { contains: f.q, mode: "insensitive" } },
        { titleNative: { contains: f.q, mode: "insensitive" } },
        ...(asId !== null ? [{ anilistId: asId }, { anidbId: asId }, { kitsuId: asId }, { malId: asId }] : []),
      ],
    });
  }
  if (f.formato) and.push({ format: f.formato });
  if (f.situacao) and.push({ status: f.situacao });
  if (f.ano) and.push({ seasonYear: Number(f.ano) });
  if (f.temporada) and.push({ season: f.temporada });
  if (f.fonte === "anilist") and.push({ source: "anilist" });
  if (f.fonte === "anidb") and.push({ source: "anidb" });
  if (f.fonte === "sem-anilist") and.push({ anilistId: null });
  // Por padrão, só o que está na plataforma (o cache de busca é ruído para a curadoria).
  and.push({ onPlatform: f.visibilidade !== "cache" });
  if (f.qualidade) and.push(QUALITY_FILTERS[f.qualidade].where);
  return { AND: and };
}

export type WorkRow = {
  id: string;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  anilistId: number | null;
  anidbId: number | null;
  kitsuId: number | null;
  malId: number | null;
  format: string | null;
  kind: string | null;
  season: string | null;
  seasonYear: number | null;
  status: string | null;
  episodes: number | null;
  scheduled: number;
  aired: number;
  onPlatform: boolean;
  openIssues: number;
  manualFields: string[];
  updatedAt: string;
};

/** O filtro completo, incluindo "com/sem pendência" (consulta à parte: não há relação no schema). */
export async function worksWhereFull(f: WorksFilters): Promise<Prisma.CatalogEntryWhereInput> {
  const where = worksWhere(f);
  if (!f.pendencias) return where;
  const withIssues = (await prisma.curationIssue.findMany({ where: { status: "OPEN" }, select: { entryId: true }, distinct: ["entryId"] })).map((i) => i.entryId);
  return { AND: [where, f.pendencias === "com" ? { id: { in: withIssues } } : { id: { notIn: withIssues } }] };
}

export async function loadWorksPage(f: WorksFilters): Promise<{ rows: WorkRow[]; total: number; page: number; pages: number }> {
  const where = await worksWhereFull(f);
  const total = await prisma.catalogEntry.count({ where });
  const rows = await prisma.catalogEntry.findMany({ where, orderBy: [{ titleRomaji: "asc" }, { id: "asc" }], skip: f.pagina * WORKS_PAGE_SIZE, take: WORKS_PAGE_SIZE });
  const ids = rows.map((r) => r.id);
  const now = new Date();
  const [issues, scheduled, aired] = await Promise.all([
    prisma.curationIssue.groupBy({ by: ["entryId"], where: { entryId: { in: ids }, status: "OPEN" }, _count: { _all: true } }),
    prisma.airingScheduleEntry.groupBy({ by: ["catalogEntryId"], where: { catalogEntryId: { in: ids } }, _count: { _all: true } }),
    prisma.airingScheduleEntry.groupBy({ by: ["catalogEntryId"], where: { catalogEntryId: { in: ids }, airingAt: { lte: now } }, _count: { _all: true } }),
  ]);
  const count = (list: Array<{ _count: { _all: number } } & Record<string, unknown>>, key: string) => new Map(list.map((x) => [x[key] as string, x._count._all]));
  const issuesBy = count(issues, "entryId");
  const scheduledBy = count(scheduled, "catalogEntryId");
  const airedBy = count(aired, "catalogEntryId");
  return {
    total,
    page: f.pagina,
    pages: Math.max(1, Math.ceil(total / WORKS_PAGE_SIZE)),
    rows: rows.map((r) => ({
      id: r.id,
      titleRomaji: r.titleRomaji,
      titleEnglish: r.titleEnglish,
      titleNative: r.titleNative,
      coverImage: r.coverImage,
      anilistId: r.anilistId,
      anidbId: r.anidbId,
      kitsuId: r.kitsuId,
      malId: r.malId,
      format: r.format,
      kind: r.kind,
      season: r.season,
      seasonYear: r.seasonYear,
      status: r.status,
      episodes: r.episodes,
      scheduled: scheduledBy.get(r.id) ?? 0,
      aired: airedBy.get(r.id) ?? 0,
      onPlatform: r.onPlatform,
      openIssues: issuesBy.get(r.id) ?? 0,
      manualFields: r.manualFields,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}
