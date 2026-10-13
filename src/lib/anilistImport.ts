import type { CatalogEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAiringScheduleForMedia, getMediaByIds, getSeasonalAnime, fuzzyDateToISO, type AniListAiringEntry, type AniListMedia } from "@/lib/anilist";
import { cacheAniListMedia } from "@/lib/catalogCache";
import { cacheAiringSchedule } from "@/lib/airingCache";
import { hasBlockedGenre, NOT_BLOCKED_GENRE } from "@/lib/contentPolicy";
import { noProgress, type ProgressReport } from "@/lib/progressJob";
import { syncContinuations } from "@/lib/continuation";

/**
 * Painel de importação da AniList (Admin → AniList): o admin vê a temporada, ESCOLHE o que trazer para a plataforma e
 * pode COMPLEMENTAR com mais informação o que a plataforma já tem. Nada vem sozinho: ver `CatalogEntry.onPlatform`.
 * Conteúdo adulto (hentai) nunca entra.
 */
export const MAX_SELECTION = 150;
const AIRING_BATCH = 40;
const AIRING_PAUSE_MS = 1500;

export type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Ids válidos de um pedido: inteiros positivos, sem repetir, até o limite. */
export function parseIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids: number[] = [];
  for (const raw of value) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.length > 0 && ids.length <= MAX_SELECTION ? ids : null;
}

export type ImportDeps = {
  fetchSeason: (season: Season, year: number) => Promise<AniListMedia[]>;
  fetchByIds: (ids: number[]) => Promise<AniListMedia[]>;
  fetchAiring: (ids: number[]) => Promise<{ entries: AniListAiringEntry[]; truncated: boolean }>;
  cacheAiring: (entries: AniListAiringEntry[]) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
};

export const defaultImportDeps: ImportDeps = {
  // Painel do admin: sempre o que a AniList tem agora, nunca a resposta guardada.
  fetchSeason: (season, year) => getSeasonalAnime(season, year, { includeBlocked: true, fresh: true }),
  fetchByIds: (ids) => getMediaByIds(ids, { fresh: true }),
  fetchAiring: (ids) => getAiringScheduleForMedia(ids, { fresh: true }),
  cacheAiring: cacheAiringSchedule,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// ---------- Trazer a temporada ----------

/** "platform" já está na plataforma · "cache" a AniList já devolveu antes, mas ninguém trouxe · "new" nunca vista. */
export type SeasonItemState = "platform" | "cache" | "new";

export type SeasonItem = {
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string | null;
  titleNative: string | null;
  coverImage: string | null;
  genres: string[];
  episodes: number | null;
  status: string | null;
  averageScore: number | null;
  state: SeasonItemState;
};

export async function previewSeason(season: Season, year: number, deps: ImportDeps = defaultImportDeps, report: ProgressReport = noProgress): Promise<{ items: SeasonItem[]; blocked: number }> {
  await report("Consultando a temporada na AniList…");
  const media = await deps.fetchSeason(season, year);
  await report(`${media.length} obras recebidas. Conferindo o que já está na plataforma…`);
  const allowed = media.filter((m) => !hasBlockedGenre(m.genres));
  const blocked = media.length - allowed.length;
  const existing = await prisma.catalogEntry.findMany({ where: { anilistId: { in: allowed.map((m) => m.id) } }, select: { anilistId: true, onPlatform: true } });
  const known = new Map(existing.map((e) => [e.anilistId as number, e.onPlatform]));
  // Fica guardado como CACHE (fora da plataforma) para a importação seguinte não precisar buscar de novo.
  // Obras que já estão na plataforma ficam como estão (quem atualiza é o "Complementar", nunca a simples consulta).
  await report(`Guardando ${allowed.length} obras no cache…`);
  await cacheAniListMedia(allowed.filter((m) => known.get(m.id) !== true), { rankFromOrder: false });
  const items = allowed.map<SeasonItem>((m) => ({
    anilistId: m.id,
    titleRomaji: m.title.romaji,
    titleEnglish: m.title.english,
    titleNative: m.title.native,
    coverImage: m.coverImage.extraLarge,
    genres: m.genres,
    episodes: m.episodes,
    status: m.status,
    averageScore: m.averageScore,
    state: known.get(m.id) === true ? "platform" : known.has(m.id) ? "cache" : "new",
  }));
  return { items, blocked };
}

export type ImportSummary = {
  /** Obras que entraram na plataforma agora. */
  brought: number;
  /** Já estavam na plataforma. */
  alreadyIn: number;
  /** Pedidas, mas sem registro no cache (busque a temporada de novo). */
  missing: number;
  /** Conteúdo adulto: recusado. */
  blocked: number;
  /** Episódios gravados no calendário. */
  episodes: number;
};

export async function loadAiring(ids: number[], deps: ImportDeps = defaultImportDeps, report: ProgressReport = noProgress): Promise<number> {
  let episodes = 0;
  const batches = chunk(ids, AIRING_BATCH);
  for (const [index, batch] of batches.entries()) {
    await report(`Carregando os episódios no calendário: lote ${index + 1} de ${batches.length}`, index, batches.length);
    if (index > 0) await deps.sleep(AIRING_PAUSE_MS);
    const { entries } = await deps.fetchAiring(batch);
    const allowed = new Set(batch);
    const scoped = entries.filter((e) => allowed.has(e.anilistId));
    await deps.cacheAiring(scoped);
    episodes += scoped.length;
  }
  return episodes;
}

/** Traz as obras escolhidas para a plataforma e carrega os episódios delas no calendário. */
export async function importSelected(ids: number[], deps: ImportDeps = defaultImportDeps, report: ProgressReport = noProgress): Promise<ImportSummary> {
  await report(`Conferindo ${ids.length} obras escolhidas…`, 0, 1);
  const rows = await prisma.catalogEntry.findMany({ where: { anilistId: { in: ids } }, select: { anilistId: true, onPlatform: true, genres: true } });
  const byId = new Map(rows.map((r) => [r.anilistId as number, r]));
  const summary: ImportSummary = { brought: 0, alreadyIn: 0, missing: 0, blocked: 0, episodes: 0 };
  const toBring: number[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) summary.missing += 1;
    else if (hasBlockedGenre(row.genres)) summary.blocked += 1;
    else if (row.onPlatform) summary.alreadyIn += 1;
    else toBring.push(id);
  }
  if (toBring.length > 0) {
    await report(`Trazendo ${toBring.length} obras para a plataforma…`);
    await prisma.catalogEntry.updateMany({ where: { anilistId: { in: toBring } }, data: { onPlatform: true } });
    summary.brought = toBring.length;
    summary.episodes = await loadAiring(toBring, deps, report);
    await report("Procurando continuações de obras que as pessoas acompanham…");
    await syncContinuations();
  }
  await prisma.adminLog
    .create({ data: { source: "AniList", level: "INFO", event: "AniList import", message: `${summary.brought} obra(s) trazida(s) · ${summary.episodes} episódio(s) no calendário · ${summary.alreadyIn} já estavam · ${summary.missing} sem cache · ${summary.blocked} bloqueada(s).`, context: "Painel de importação da AniList" } })
    .catch(() => undefined);
  return summary;
}

// ---------- Complementar o que já existe ----------

/** Campos que o complemento sabe preencher, com o nome que o admin vê. */
export const COMPLEMENT_FIELDS = [
  ["titleEnglish", "título em inglês"],
  ["titleNative", "título original"],
  ["coverImage", "capa"],
  ["bannerImage", "banner"],
  ["description", "sinopse"],
  ["episodes", "nº de episódios"],
  ["status", "situação"],
  ["season", "temporada"],
  ["genres", "gêneros"],
  ["averageScore", "nota"],
  ["startDate", "data de início"],
  ["endDate", "data de término"],
] as const;
type ComplementField = (typeof COMPLEMENT_FIELDS)[number][0];

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

type Existing = Pick<CatalogEntry, ComplementField | "seasonYear" | "malId" | "nextEpisodeNumber" | "nextEpisodeAt">;

/** Só fazem sentido numa obra que já terminou de ser exibida (no ar, a AniList ainda não tem total de episódios, nota nem fim). */
const ONLY_WHEN_FINISHED: ReadonlySet<ComplementField> = new Set(["episodes", "averageScore", "endDate"]);

/** O que falta numa obra da plataforma (nomes legíveis), para o admin escolher o que complementar. */
export function missingFields(entry: Pick<CatalogEntry, ComplementField>): string[] {
  return COMPLEMENT_FIELDS.filter(([key]) => isEmpty(entry[key]) && (!ONLY_WHEN_FINISHED.has(key) || entry.status === "FINISHED")).map(([, label]) => label);
}

/**
 * Junta o que a AniList trouxe ao que a plataforma tem. Por padrão só PREENCHE o que está vazio; com `overwrite`
 * a AniList passa a valer em tudo. Devolve os campos gravados (com o nome legível) para o resumo.
 */
export function mergeCatalogFields(existing: Existing, incoming: AniListMedia, overwrite: boolean): { data: Record<string, unknown>; filled: string[] } {
  const data: Record<string, unknown> = {};
  const filled: string[] = [];
  const startISO = fuzzyDateToISO(incoming.startDate);
  const endISO = fuzzyDateToISO(incoming.endDate);
  const candidates: Array<[ComplementField, unknown]> = [
    ["titleEnglish", incoming.title.english],
    ["titleNative", incoming.title.native],
    ["coverImage", incoming.coverImage.extraLarge],
    ["bannerImage", incoming.bannerImage],
    ["description", incoming.description],
    ["episodes", incoming.episodes],
    ["status", incoming.status],
    ["season", incoming.season],
    ["genres", incoming.genres.length ? incoming.genres.join(",") : null],
    ["averageScore", incoming.averageScore],
    ["startDate", startISO ? new Date(startISO) : null],
    ["endDate", endISO ? new Date(endISO) : null],
  ];
  const label = new Map<string, string>(COMPLEMENT_FIELDS);
  for (const [key, value] of candidates) {
    if (isEmpty(value)) continue;
    const current = existing[key];
    const same = current instanceof Date && value instanceof Date ? current.getTime() === value.getTime() : current === value;
    if (same || (!overwrite && !isEmpty(current))) continue;
    data[key] = value;
    filled.push(label.get(key) ?? key);
  }
  if (incoming.season && (overwrite || isEmpty(existing.seasonYear)) && incoming.seasonYear && existing.seasonYear !== incoming.seasonYear) data.seasonYear = incoming.seasonYear;
  if (isEmpty(existing.malId) && incoming.idMal) data.malId = incoming.idMal;
  if (incoming.nextAiringEpisode) {
    data.nextEpisodeNumber = incoming.nextAiringEpisode.episode;
    data.nextEpisodeAt = new Date(incoming.nextAiringEpisode.airingAt * 1000);
  }
  return { data, filled };
}

export type ComplementSummary = {
  /** Obras da plataforma consultadas na AniList. */
  works: number;
  /** Obras em que algo foi preenchido/atualizado. */
  updated: number;
  /** Campos preenchidos no total. */
  fields: number;
  /** A AniList não devolveu (ou é conteúdo adulto). */
  notFound: number;
  /** Fora da plataforma: ignoradas. */
  skipped: number;
  /** Episódios gravados/atualizados no calendário. */
  episodes: number;
};

export async function complementSelected(ids: number[], overwrite: boolean, deps: ImportDeps = defaultImportDeps, report: ProgressReport = noProgress): Promise<ComplementSummary> {
  const rows = await prisma.catalogEntry.findMany({ where: { anilistId: { in: ids }, onPlatform: true, ...NOT_BLOCKED_GENRE } });
  const summary: ComplementSummary = { works: 0, updated: 0, fields: 0, notFound: 0, skipped: ids.length - rows.length, episodes: 0 };
  if (rows.length === 0) return summary;
  await report(`Consultando ${rows.length} obras na AniList…`);
  const media = await deps.fetchByIds(rows.map((r) => r.anilistId as number));
  const mediaById = new Map(media.map((m) => [m.id, m]));
  let checked = 0;
  for (const row of rows) {
    if (checked % 5 === 0) await report(`Complementando: ${checked} de ${rows.length}`, checked, rows.length);
    checked += 1;
    const incoming = mediaById.get(row.anilistId as number);
    if (!incoming) {
      summary.notFound += 1;
      continue;
    }
    summary.works += 1;
    const { data, filled } = mergeCatalogFields(row, incoming, overwrite);
    // Conferida na AniList: o que continuar vazio é porque ela não tem (deixa de contar como pendência).
    await prisma.catalogEntry.update({ where: { id: row.id }, data: { ...data, complementedAt: new Date() } });
    if (filled.length > 0) summary.updated += 1;
    summary.fields += filled.length;
  }
  summary.episodes = await loadAiring(
    rows.map((r) => r.anilistId as number).filter((id) => mediaById.has(id)),
    deps,
    report
  );
  await prisma.adminLog
    .create({ data: { source: "AniList", level: "INFO", event: "AniList complement", message: `${summary.updated} de ${summary.works} obra(s) complementada(s) · ${summary.fields} campo(s) · ${summary.episodes} episódio(s) no calendário${overwrite ? " · sobrescrevendo" : ""}.`, context: "Painel de importação da AniList" } })
    .catch(() => undefined);
  return summary;
}

export type PlatformWork = {
  anilistId: number;
  titleRomaji: string;
  titleNative: string | null;
  coverImage: string | null;
  season: string | null;
  seasonYear: number | null;
  /** Pendência: falta e ainda não foi conferida na AniList. */
  missing: string[];
  /** Já conferida na AniList (ISO) e o que ela não tem. */
  checkedAt: string | null;
  absent: string[];
  episodes: number;
};

/** Obras que já estão na plataforma, com o que falta em cada uma e quantos episódios têm no calendário. */
export async function platformWorks(): Promise<PlatformWork[]> {
  const rows = await prisma.catalogEntry.findMany({ where: { onPlatform: true, anilistId: { not: null }, ...NOT_BLOCKED_GENRE }, orderBy: { titleRomaji: "asc" } });
  const counts = await prisma.airingScheduleEntry.groupBy({ by: ["anilistId"], where: { anilistId: { in: rows.map((r) => r.anilistId as number) } }, _count: { _all: true } });
  const episodes = new Map(counts.map((c) => [c.anilistId, c._count._all]));
  return rows.map((r) => ({
    anilistId: r.anilistId as number,
    titleRomaji: r.titleRomaji,
    titleNative: r.titleNative,
    coverImage: r.coverImage,
    season: r.season,
    seasonYear: r.seasonYear,
    // Já conferida na AniList: o que falta é porque ela não tem — não é mais pendência.
    missing: r.complementedAt ? [] : missingFields(r),
    checkedAt: r.complementedAt ? r.complementedAt.toISOString() : null,
    absent: r.complementedAt ? missingFields(r) : [],
    episodes: episodes.get(r.anilistId as number) ?? 0,
  }));
}
