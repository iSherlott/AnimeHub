import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DATE_CERTAINTIES, EPISODE_STATUSES, releaseState, withAnilist, type ReleaseState } from "@/lib/episodeState";
import { changeHistory, type ChangeRow } from "@/lib/changeLog";

/**
 * Admin → Episódios (Fase 4): os episódios GLOBAIS como registros de catálogo e eventos de exibição — sem nada de
 * progresso pessoal. Lista filtrada e paginada no servidor; o detalhe junta a obra, a data efetiva (com override),
 * possíveis duplicados e o histórico.
 */
export const EPISODES_PAGE_SIZE = 50;

export const EPISODE_STATE_FILTERS: ReleaseState[] = ["AIRED", "SCHEDULED", "EXPECTED", "UNKNOWN_DATE", "POSTPONED", "CANCELLED"];
export const EPISODE_SOURCES = ["anilist", "kitsu", "anidb", "manual", "legacy"] as const;
export const EPISODE_ISSUES = {
  "sem-titulo": "Sem título",
  "sem-sinopse": "Sem sinopse",
  "sem-data": "Sem data",
  "acima-do-total": "Número acima do total informado",
  "titulo-repetido": "Título repetido na obra",
  manual: "Com campo corrigido à mão",
} as const;
export type EpisodeIssue = keyof typeof EPISODE_ISSUES;

export type EpisodesFilters = {
  obra: string;
  q: string;
  numero: string;
  situacao: "" | ReleaseState;
  fonte: string;
  de: string;
  ate: string;
  pendencia: "" | EpisodeIssue;
  /** "data": ordem cronológica (Admin → Calendário); padrão: da obra pelo número, ou as alteradas por último. */
  ordem: "" | "data";
  pagina: number;
};

export function parseEpisodesFilters(sp: URLSearchParams | Record<string, string | undefined>): EpisodesFilters {
  const get = (name: string) => ((sp instanceof URLSearchParams ? sp.get(name) : sp[name]) ?? "").trim();
  const oneOf = <T extends string>(value: string, list: readonly T[]): T | "" => ((list as readonly string[]).includes(value) ? (value as T) : "");
  const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) ? v : "");
  return {
    obra: /^[a-z0-9]{8,40}$/i.test(get("obra")) ? get("obra") : "",
    q: get("q").slice(0, 80),
    numero: /^\d{1,4}$/.test(get("numero")) ? get("numero") : "",
    situacao: oneOf(get("situacao"), EPISODE_STATE_FILTERS),
    fonte: oneOf(get("fonte"), EPISODE_SOURCES),
    de: day(get("de")),
    ate: day(get("ate")),
    pendencia: oneOf(get("pendencia"), Object.keys(EPISODE_ISSUES) as EpisodeIssue[]),
    ordem: oneOf(get("ordem"), ["data"] as const),
    pagina: Math.max(0, Math.min(10_000, Number(get("pagina")) || 0)),
  };
}

const startOfTodayUtc = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** O mesmo critério de `releaseState`, em consulta (para filtrar no banco). */
export function stateWhere(state: ReleaseState, now: Date = new Date()): Prisma.AiringScheduleEntryWhereInput {
  const today = startOfTodayUtc(now);
  switch (state) {
    case "CANCELLED":
      return { status: "CANCELLED" };
    case "POSTPONED":
      return { status: "POSTPONED" };
    case "AIRED":
      return { status: "ACTIVE", OR: [{ airingAt: { lte: now } }, { airingAt: null, airDate: { lt: today } }] };
    case "SCHEDULED":
      return { status: "ACTIVE", airingAt: { gt: now } };
    case "EXPECTED":
      return { status: "ACTIVE", airingAt: null, airDate: { gte: today } };
    case "UNKNOWN_DATE":
      return { status: "ACTIVE", airingAt: null, airDate: null };
  }
}

async function issueIds(issue: "acima-do-total" | "titulo-repetido"): Promise<string[]> {
  const rows =
    issue === "acima-do-total"
      ? await prisma.$queryRaw<Array<{ id: string }>>`SELECT s."id" FROM "AiringScheduleEntry" s JOIN "CatalogEntry" c ON c."anilistId" = s."anilistId" WHERE c."episodes" IS NOT NULL AND s."episode" > c."episodes" LIMIT 5000`
      : await prisma.$queryRaw<Array<{ id: string }>>`SELECT s."id" FROM "AiringScheduleEntry" s JOIN (SELECT "anilistId", lower("episodeTitle") AS t FROM "AiringScheduleEntry" WHERE "episodeTitle" IS NOT NULL GROUP BY 1, 2 HAVING COUNT(*) > 1) d ON d."anilistId" = s."anilistId" AND d.t = lower(s."episodeTitle") LIMIT 5000`;
  return rows.map((r) => r.id);
}

export async function episodesWhere(f: EpisodesFilters, now: Date = new Date()): Promise<Prisma.AiringScheduleEntryWhereInput> {
  const and: Prisma.AiringScheduleEntryWhereInput[] = [];
  if (f.obra) {
    const work = await prisma.catalogEntry.findUnique({ where: { id: f.obra }, select: { anilistId: true } });
    and.push({ OR: [{ catalogEntryId: f.obra }, ...(work?.anilistId ? [{ anilistId: work.anilistId }] : [])] });
  }
  if (f.q) {
    const asId = /^\d{1,9}$/.test(f.q) ? Number(f.q) : null;
    and.push({
      OR: [
        { titleRomaji: { contains: f.q, mode: "insensitive" } },
        { titleEnglish: { contains: f.q, mode: "insensitive" } },
        { titleNative: { contains: f.q, mode: "insensitive" } },
        { episodeTitle: { contains: f.q, mode: "insensitive" } },
        { episodeTitleEn: { contains: f.q, mode: "insensitive" } },
        { episodeTitleJa: { contains: f.q, mode: "insensitive" } },
        ...(asId !== null ? [{ anilistId: asId }] : []),
      ],
    });
  }
  if (f.numero) and.push({ episode: Number(f.numero) });
  if (f.situacao) and.push(stateWhere(f.situacao, now));
  if (f.fonte) and.push({ source: f.fonte });
  if (f.de || f.ate) {
    const from = f.de ? new Date(`${f.de}T00:00:00Z`) : undefined;
    const to = f.ate ? new Date(Date.parse(`${f.ate}T00:00:00Z`) + 86_400_000) : undefined;
    const range = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
    // Horário efetivo (Fase 5): o override do admin conta — um episódio que ele trouxe para o período também entra.
    const moved = await prisma.catalogOverride.findMany({ where: { field: "airingAt", removedAt: null, value: range }, select: { anilistId: true, episode: true } });
    and.push({ OR: [{ airingAt: range }, { airingAt: null, airDate: range }, ...moved.map((m) => ({ anilistId: m.anilistId, episode: m.episode }))] });
  }
  switch (f.pendencia) {
    case "sem-titulo":
      and.push({ episodeTitle: null, episodeTitleEn: null, episodeTitleJa: null });
      break;
    case "sem-sinopse":
      and.push({ synopsis: null });
      break;
    case "sem-data":
      and.push({ airingAt: null, airDate: null });
      break;
    case "manual":
      and.push({ NOT: { manualFields: { isEmpty: true } } });
      break;
    case "acima-do-total":
    case "titulo-repetido":
      and.push({ id: { in: await issueIds(f.pendencia) } });
      break;
  }
  return { AND: and };
}

export type EpisodeRow = {
  id: string;
  catalogEntryId: string | null;
  /** Nulo nas obras só do AniDB. */
  anilistId: number | null;
  workTitle: string;
  workTitleNative: string | null;
  episode: number;
  title: string | null;
  titleJa: string | null;
  hasSynopsis: boolean;
  airingAt: string | null;
  airDate: string | null;
  overridden: boolean;
  state: ReleaseState;
  source: string;
  manualFields: string[];
  updatedAt: string;
};

export async function loadEpisodesPage(f: EpisodesFilters, now: Date = new Date()): Promise<{ rows: EpisodeRow[]; total: number; page: number; pages: number }> {
  const where = await episodesWhere(f, now);
  const total = await prisma.airingScheduleEntry.count({ where });
  // Com a obra escolhida, a ordem é a da obra (número); sem obra, a mais recente primeiro.
  const orderBy: Prisma.AiringScheduleEntryOrderByWithRelationInput[] =
    f.ordem === "data" ? [{ airingAt: { sort: "asc", nulls: "last" } }, { airDate: { sort: "asc", nulls: "last" } }, { anilistId: "asc" }, { episode: "asc" }] : f.obra ? [{ episode: "asc" }] : [{ updatedAt: "desc" }, { id: "asc" }];
  const rows = await prisma.airingScheduleEntry.findMany({ where, orderBy, skip: f.pagina * EPISODES_PAGE_SIZE, take: EPISODES_PAGE_SIZE });
  const overrides = rows.length
    ? await prisma.catalogOverride.findMany({ where: { removedAt: null, field: "airingAt", OR: withAnilist(rows).map((r) => ({ anilistId: r.anilistId, episode: r.episode })) }, select: { anilistId: true, episode: true, value: true }, orderBy: { createdAt: "desc" } })
    : [];
  const overrideBy = new Map<string, Date>();
  for (const o of overrides) if (!overrideBy.has(`${o.anilistId}-${o.episode}`)) overrideBy.set(`${o.anilistId}-${o.episode}`, o.value);
  return {
    total,
    page: f.pagina,
    pages: Math.max(1, Math.ceil(total / EPISODES_PAGE_SIZE)),
    rows: rows.map((r) => {
      const effective = overrideBy.get(`${r.anilistId}-${r.episode}`) ?? r.airingAt;
      return {
        id: r.id,
        catalogEntryId: r.catalogEntryId,
        anilistId: r.anilistId,
        workTitle: r.titleRomaji,
        workTitleNative: r.titleNative,
        episode: r.episode,
        title: r.episodeTitle ?? r.episodeTitleEn,
        titleJa: r.episodeTitleJa,
        hasSynopsis: Boolean(r.synopsis),
        airingAt: effective ? effective.toISOString() : null,
        airDate: r.airDate ? r.airDate.toISOString().slice(0, 10) : null,
        overridden: overrideBy.has(`${r.anilistId}-${r.episode}`),
        state: releaseState({ ...r, airingAt: effective }, now),
        source: r.source,
        manualFields: r.manualFields,
        updatedAt: r.updatedAt.toISOString(),
      };
    }),
  };
}

export type EpisodeDetail = {
  row: Awaited<ReturnType<typeof prisma.airingScheduleEntry.findUniqueOrThrow>>;
  work: { id: string; titleRomaji: string; titleNative: string | null; episodes: number | null; status: string | null } | null;
  state: ReleaseState;
  override: { id: string; value: string; originalValue: string; originalSource: string; reason: string; adminName: string; createdAt: string } | null;
  duplicates: Array<{ id: string; episode: number; reason: string }>;
  neighbors: { previous: { id: string; episode: number } | null; next: { id: string; episode: number } | null };
  history: { rows: ChangeRow[]; total: number };
  overridesHistory: Array<{ id: string; value: string; originalValue: string; reason: string; adminName: string; createdAt: string; removedAt: string | null; removedByName: string | null }>;
  /** Rastro dos avisos (Fase 5): quantos avisos de lançamento e de data alterada saíram para este episódio. */
  alerts: { total: number; rescheduled: number; seen: number; lastAt: string | null };
};

export async function loadEpisodeDetail(id: string, historyPage = 0, now: Date = new Date()): Promise<EpisodeDetail | null> {
  const row = await prisma.airingScheduleEntry.findUnique({ where: { id } });
  if (!row) return null;
  const [work, overrides, siblings, history, alertRows] = await Promise.all([
    prisma.catalogEntry.findFirst({ where: row.catalogEntryId ? { id: row.catalogEntryId } : { anilistId: row.anilistId }, select: { id: true, titleRomaji: true, titleNative: true, episodes: true, status: true } }),
    // Overrides e avisos existem só para obras da AniList (as só do AniDB não têm horário da fonte nem sino).
    row.anilistId !== null ? prisma.catalogOverride.findMany({ where: { anilistId: row.anilistId, episode: row.episode, field: "airingAt" }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    prisma.airingScheduleEntry.findMany({ where: { ...(row.catalogEntryId ? { catalogEntryId: row.catalogEntryId } : { anilistId: row.anilistId }), NOT: { id: row.id } }, select: { id: true, episode: true, airingAt: true, episodeTitle: true }, orderBy: { episode: "asc" } }),
    changeHistory({ entity: "AiringScheduleEntry", entityId: row.id }, historyPage, 30),
    row.anilistId !== null ? prisma.airingAlert.findMany({ where: { anilistId: row.anilistId, episode: row.episode }, select: { createdAt: true, previousAiringAt: true, seenAt: true }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
  ]);
  const active = overrides.find((o) => o.removedAt === null) ?? null;
  const effective = active?.value ?? row.airingAt;
  const duplicates: EpisodeDetail["duplicates"] = [];
  for (const s of siblings) {
    if (row.episodeTitle && s.episodeTitle && s.episodeTitle.toLowerCase() === row.episodeTitle.toLowerCase()) duplicates.push({ id: s.id, episode: s.episode, reason: "mesmo título" });
    else if (row.airingAt && s.airingAt && s.airingAt.getTime() === row.airingAt.getTime()) duplicates.push({ id: s.id, episode: s.episode, reason: "mesmo dia e hora (pode ser episódio duplo)" });
  }
  const previous = [...siblings].reverse().find((s) => s.episode < row.episode) ?? null;
  const next = siblings.find((s) => s.episode > row.episode) ?? null;
  return {
    row,
    work,
    state: releaseState({ ...row, airingAt: effective }, now),
    override: active ? { id: active.id, value: active.value.toISOString(), originalValue: active.originalValue.toISOString(), originalSource: active.originalSource, reason: active.reason, adminName: active.adminName, createdAt: active.createdAt.toISOString() } : null,
    duplicates,
    neighbors: { previous: previous ? { id: previous.id, episode: previous.episode } : null, next: next ? { id: next.id, episode: next.episode } : null },
    history,
    alerts: { total: alertRows.length, rescheduled: alertRows.filter((a) => a.previousAiringAt).length, seen: alertRows.filter((a) => a.seenAt).length, lastAt: alertRows[0]?.createdAt.toISOString() ?? null },
    overridesHistory: overrides.map((o) => ({ id: o.id, value: o.value.toISOString(), originalValue: o.originalValue.toISOString(), reason: o.reason, adminName: o.adminName, createdAt: o.createdAt.toISOString(), removedAt: o.removedAt?.toISOString() ?? null, removedByName: o.removedByName })),
  };
}

export { DATE_CERTAINTIES, EPISODE_STATUSES };
