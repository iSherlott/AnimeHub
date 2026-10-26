import type { CatalogEntry, FieldUpdateItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fuzzyDateToISO, getOfficialSiteUrl, type AniListMedia } from "@/lib/anilist";
import { recordChanges, normalizeValue, type ChangeActor } from "@/lib/changeLog";
import { defaultImportDeps, MAX_SELECTION, type ImportDeps } from "@/lib/anilistImport";
import { ADULT_MARKER, genresFromAniList, visibleGenres } from "@/lib/genreTaxonomy";
import { propagateWork } from "@/lib/workPropagation";
import { getKitsuAnimeByIds, type KitsuAnimeDetails } from "@/lib/kitsu";
import { getAnidbAnimeById, isAnidbConfigured, type AnidbAnime } from "@/lib/anidb";
import { aliveExclusiveJob } from "@/lib/jobLock";

/**
 * Atualização seletiva de campos (Fase 6, §11 e Cenário F). Etapas:
 *  1. seleção (obras escolhidas ou um filtro do catálogo) → 2. coleta na fonte, sem tocar no catálogo →
 *  3/4. normalização e comparação campo a campo (atual × recebido, protegido, sem valor na fonte) →
 *  5. o admin escolhe os campos (em grupo, com exceções por obra) → 6. prévia → 7. execução item a item, com falha
 *  isolada → 8. resultado e reprocessamento das falhas.
 * Regras: campo ausente na resposta não vira vazio; valor protegido só muda se o admin escolher de propósito; a
 * execução confere se o valor atual ainda é o da coleta (senão, conflito); tudo vai para o ChangeLog com o lote.
 *
 * Fontes: AniList (padrão), Kitsu e AniDB — cada lote compara com UMA fonte. A Kitsu é consultada de 20 em 20 obras; o
 * AniDB uma obra por vez, com `ANIDB_REQUEST_GAP_MS` entre elas (padrão 4 s), em segundo plano, parando no primeiro sinal
 * de bloqueio. O que a fonte não informa fica "a fonte não informa" — nunca vira vazio nem é deduzido (temporada e ano
 * não saem da data de estreia; categorias da Kitsu não são gêneros).
 */
export const FIELD_UPDATE_SOURCES = {
  anilist: { label: "AniList", idField: "anilistId", max: MAX_SELECTION },
  kitsu: { label: "Kitsu", idField: "kitsuId", max: MAX_SELECTION },
  anidb: { label: "AniDB", idField: "anidbId", max: 50 },
} as const;
export type FieldUpdateSource = keyof typeof FIELD_UPDATE_SOURCES;
export const isFieldUpdateSource = (v: unknown): v is FieldUpdateSource => typeof v === "string" && v in FIELD_UPDATE_SOURCES;
/** A fonte de um lote (guardada no job pelo rótulo; lotes antigos são da AniList). */
export const sourceOfJob = (label: string | null | undefined): FieldUpdateSource => (Object.entries(FIELD_UPDATE_SOURCES).find(([, s]) => s.label === label)?.[0] as FieldUpdateSource | undefined) ?? "anilist";
export const FIELD_GROUPS = {
  titulos: { label: "Títulos", fields: ["titleRomaji", "titleEnglish", "titleNative"] },
  sinopse: { label: "Sinopse", fields: ["description"] },
  generos: { label: "Gêneros", fields: ["genres"] },
  ficha: { label: "Ficha (formato, situação, episódios, época, datas)", fields: ["format", "status", "episodes", "season", "seasonYear", "startDate", "endDate"] },
  imagens: { label: "Imagens", fields: ["coverImage", "bannerImage"] },
  site: { label: "Site oficial", fields: ["officialSite"] },
} as const;
export type FieldGroup = keyof typeof FIELD_GROUPS;
export type UpdatableField = (typeof FIELD_GROUPS)[FieldGroup]["fields"][number];
export const UPDATABLE_FIELDS: UpdatableField[] = Object.values(FIELD_GROUPS).flatMap((g) => [...g.fields]);
export const FIELD_UPDATE_LABELS: Record<UpdatableField, string> = {
  titleRomaji: "Título (romaji)",
  titleEnglish: "Título (inglês)",
  titleNative: "Título (japonês)",
  description: "Sinopse (original)",
  genres: "Gêneros",
  format: "Formato",
  status: "Situação",
  episodes: "Episódios (informado)",
  season: "Temporada",
  seasonYear: "Ano",
  startDate: "Estreia",
  endDate: "Fim",
  coverImage: "Capa",
  bannerImage: "Banner",
  officialSite: "Site oficial",
};
/** Acima disso, executar exige confirmação explícita. */
export const LARGE_BATCH = 20;

export type FieldDiff = { field: UpdatableField; group: FieldGroup; current: string | null; incoming: string | null; changed: boolean; protected: boolean; missing: boolean };

const groupOf = (field: UpdatableField): FieldGroup => (Object.entries(FIELD_GROUPS).find(([, g]) => (g.fields as readonly string[]).includes(field))?.[0] ?? "ficha") as FieldGroup;

/** Valor comparável/guardável de um campo do catálogo (datas viram AAAA-MM-DD; listas, texto). */
function comparable(field: UpdatableField, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (field === "genres") return String(value).split(",").filter(Boolean).sort().join(",") || null;
  return String(value);
}

/** O que a AniList informa, já normalizado como o catálogo guarda. `undefined` = a fonte não informa (não apaga). */
export function incomingFromAniList(media: AniListMedia): Partial<Record<UpdatableField, string | null>> {
  const genres = visibleGenres([...genresFromAniList(media.genres, media.tags), ...(media.isAdult ? [ADULT_MARKER] : [])]);
  const start = fuzzyDateToISO(media.startDate);
  const end = fuzzyDateToISO(media.endDate);
  const out: Partial<Record<UpdatableField, string | null>> = {
    titleRomaji: media.title.romaji || undefined,
    titleEnglish: media.title.english ?? undefined,
    titleNative: media.title.native ?? undefined,
    description: media.description ?? undefined,
    genres: genres.length ? [...new Set(genres)].sort().join(",") : undefined,
    format: media.format ?? undefined,
    status: media.status ?? undefined,
    episodes: media.episodes !== null && media.episodes !== undefined ? String(media.episodes) : undefined,
    season: media.season ?? undefined,
    seasonYear: media.seasonYear ? String(media.seasonYear) : undefined,
    startDate: start ? start.slice(0, 10) : undefined,
    endDate: end ? end.slice(0, 10) : undefined,
    coverImage: media.coverImage?.extraLarge ?? undefined,
    bannerImage: media.bannerImage ?? undefined,
    officialSite: getOfficialSiteUrl(media) ?? undefined,
  };
  return out;
}

const KITSU_STATUS: Record<string, string> = { current: "RELEASING", finished: "FINISHED", tba: "NOT_YET_RELEASED", unreleased: "NOT_YET_RELEASED", upcoming: "NOT_YET_RELEASED" };
const KITSU_FORMAT: Record<string, string> = { TV: "TV", movie: "MOVIE", OVA: "OVA", ONA: "ONA", special: "SPECIAL", music: "MUSIC" };
const day = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);

/** O que a Kitsu informa. Gêneros ficam de fora: as categorias da Kitsu são etiquetas, não o vocabulário do catálogo. */
export function incomingFromKitsu(k: KitsuAnimeDetails): Partial<Record<UpdatableField, string | null>> {
  return {
    titleRomaji: k.titles.en_jp || k.canonicalTitle || undefined,
    titleEnglish: k.titles.en || undefined,
    titleNative: k.titles.ja_jp || undefined,
    description: k.synopsis || undefined,
    format: (k.subtype && KITSU_FORMAT[k.subtype]) || undefined,
    status: (k.status && KITSU_STATUS[k.status]) || undefined,
    episodes: k.episodeCount ? String(k.episodeCount) : undefined,
    startDate: day(k.startDate),
    endDate: day(k.endDate),
    coverImage: k.posterImage || undefined,
    bannerImage: k.coverImage || undefined,
  };
}

const ANIDB_FORMAT: Record<string, string> = { "TV Series": "TV", Movie: "MOVIE", OVA: "OVA", Web: "ONA", "TV Special": "SPECIAL", "Music Video": "MUSIC" };

/** Texto da AniDB sem a marcação de links (`http://anidb.net/ch123 [Nome]` vira `Nome`). */
export function cleanAnidbText(text: string): string {
  return text.replace(/https?:\/\/anidb\.net\/\S+ \[([^\]]+)\]/g, "$1").trim();
}

/** O que o AniDB informa. Situação, gêneros, temporada e banner o AniDB não tem: ficam "a fonte não informa". */
export function incomingFromAnidb(a: AnidbAnime): Partial<Record<UpdatableField, string | null>> {
  const title = (lang: string, official: boolean) => a.titles.find((t) => t.language === lang && (!official || t.isOfficial))?.title;
  return {
    titleRomaji: title("x-jat", false) || undefined,
    titleEnglish: title("en", true) || undefined,
    titleNative: title("ja", true) || undefined,
    description: a.description ? cleanAnidbText(a.description) || undefined : undefined,
    format: (a.type && ANIDB_FORMAT[a.type]) || undefined,
    episodes: a.episodeCount ? String(a.episodeCount) : undefined,
    startDate: day(a.startDate),
    endDate: day(a.endDate),
    coverImage: a.picture || undefined,
  };
}

export function diffEntry(entry: CatalogEntry, incoming: Partial<Record<UpdatableField, string | null>>): FieldDiff[] {
  const manual = new Set(entry.manualFields);
  return UPDATABLE_FIELDS.map((field) => {
    const current = comparable(field, (entry as Record<string, unknown>)[field]);
    const value = incoming[field];
    const missing = value === undefined || value === null;
    const next = missing ? null : value;
    return { field, group: groupOf(field), current, incoming: next, changed: !missing && next !== current, protected: manual.has(field), missing };
  });
}

/** Converte o valor guardado no diff para o tipo da coluna. */
function toColumn(field: UpdatableField, value: string | null): unknown {
  if (value === null) return null;
  if (field === "episodes" || field === "seasonYear") return Number(value);
  if (field === "startDate" || field === "endDate") return new Date(`${value}T00:00:00Z`);
  return value;
}

const parseDiff = (item: Pick<FieldUpdateItem, "diffJson">): FieldDiff[] => (item.diffJson ? (JSON.parse(item.diffJson) as FieldDiff[]) : []);
const parseSelected = (item: Pick<FieldUpdateItem, "selectedJson">): UpdatableField[] => (item.selectedJson ? (JSON.parse(item.selectedJson) as UpdatableField[]) : []);
export { parseDiff, parseSelected };

// ---------- 1. Seleção + 2. Coleta ----------

export type FieldUpdateDeps = ImportDeps & { fetchKitsu: (ids: number[]) => Promise<KitsuAnimeDetails[]>; fetchAnidb: (aid: number) => Promise<AnidbAnime> };
export const defaultFieldUpdateDeps: FieldUpdateDeps = { ...defaultImportDeps, fetchKitsu: (ids) => getKitsuAnimeByIds(ids), fetchAnidb: (aid) => getAnidbAnimeById(aid) };
const anidbGapMs = () => Math.max(0, Number(process.env.ANIDB_REQUEST_GAP_MS ?? 4000));

export async function createFieldUpdate(
  catalogEntryIds: string[],
  actor: ChangeActor & { id: string; name: string },
  label: string,
  source: FieldUpdateSource = "anilist",
  deps: FieldUpdateDeps = defaultFieldUpdateDeps
): Promise<{ ok: true; seq: number } | { ok: false; status: number; error: string }> {
  const src = FIELD_UPDATE_SOURCES[source];
  const unique = [...new Set(catalogEntryIds)];
  if (unique.length === 0) return { ok: false, status: 400, error: "Escolha ao menos uma obra." };
  if (unique.length > src.max) return { ok: false, status: 400, error: `No máximo ${src.max} obras por lote (${src.label} limita as consultas). Refine o filtro.` };
  if (source === "anidb") {
    if (!isAnidbConfigured()) return { ok: false, status: 503, error: "AniDB não configurada no servidor." };
    // O limite do AniDB vale para o servidor inteiro: não junta com o lote de episódios.
    if (await aliveExclusiveJob("ANIDB_EPISODES")) return { ok: false, status: 409, error: "O lote de episódios do AniDB está rodando. Espere terminar." };
  }
  const running = await prisma.adminJob.count({ where: { kind: "FIELD_UPDATE", state: "RUNNING", stage: "COLLECT" } });
  if (running > 0) return { ok: false, status: 409, error: "Já há uma coleta em andamento. Espere terminar." };
  const entries = await prisma.catalogEntry.findMany({ where: { id: { in: unique } }, select: { id: true, anilistId: true, kitsuId: true, anidbId: true, titleRomaji: true, titleNative: true } });
  const job = await prisma.adminJob.create({ data: { kind: "FIELD_UPDATE", source: src.label, season: label.slice(0, 120), state: "RUNNING", stage: "COLLECT", total: entries.length, processed: 0, progressNote: `Coletando ${source === "anidb" ? "no" : "na"} ${src.label}…`, adminId: actor.id, adminName: actor.name } });
  const missing = source === "anidb" ? "o AniDB não tem esta obra." : `a ${src.label} não tem esta obra.`;
  await prisma.fieldUpdateItem.createMany({
    data: entries.map((e) => {
      const sourceId = e[src.idField];
      return { jobSeq: job.seq, catalogEntryId: e.id, anilistId: e.anilistId, sourceId, title: e.titleNative ?? e.titleRomaji, state: sourceId === null ? "SKIPPED" : "PENDING", message: sourceId === null ? `Sem ${src.label} ID: ${missing}` : null };
    }),
  });
  if (source === "anidb") {
    // Uma obra a cada poucos segundos: roda em segundo plano e a revisão acompanha o andamento.
    void collect(job.seq, deps).catch(async (error) => {
      await prisma.adminJob.update({ where: { seq: job.seq }, data: { stage: "REVIEW", progressNote: null, error: (error instanceof Error ? error.message : String(error)).slice(0, 300) } }).catch(() => undefined);
    });
  } else {
    await collect(job.seq, deps);
  }
  return { ok: true, seq: job.seq };
}

type Incoming = Partial<Record<UpdatableField, string | null>>;

/** Coleta (ou recoleta) os itens PENDING do lote na fonte dele. Uma falha marca o item como FAILED, sem perder o resto. */
export async function collect(seq: number, deps: FieldUpdateDeps = defaultFieldUpdateDeps): Promise<void> {
  const job = await prisma.adminJob.findUnique({ where: { seq }, select: { source: true } });
  const source = sourceOfJob(job?.source);
  const label = FIELD_UPDATE_SOURCES[source].label;
  const items = await prisma.fieldUpdateItem.findMany({ where: { jobSeq: seq, state: "PENDING" }, orderBy: { title: "asc" } });
  const entries = await prisma.catalogEntry.findMany({ where: { id: { in: items.map((i) => i.catalogEntryId) } } });
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const idOf = (item: FieldUpdateItem) => item.sourceId ?? (source === "anilist" ? item.anilistId : null);
  const now = new Date();
  let processed = 0;

  async function settle(item: FieldUpdateItem, outcome: { incoming: Incoming } | { state: "FAILED" | "NOT_FOUND"; message: string }) {
    const entry = entryById.get(item.catalogEntryId);
    if (!entry) await prisma.fieldUpdateItem.update({ where: { id: item.id }, data: { state: "FAILED", message: "A obra não existe mais no catálogo." } });
    else if ("state" in outcome) await prisma.fieldUpdateItem.update({ where: { id: item.id }, data: { state: outcome.state, message: outcome.message } });
    else await prisma.fieldUpdateItem.update({ where: { id: item.id }, data: { state: "COLLECTED", diffJson: JSON.stringify(diffEntry(entry, outcome.incoming)), selectedJson: JSON.stringify([]), collectedAt: now, message: null } });
    processed += 1;
  }

  if (source === "anidb") {
    let refused: string | null = null;
    for (const [index, item] of items.entries()) {
      if (refused) {
        await settle(item, { state: "FAILED", message: `Não consultada: o AniDB recusou as consultas (${refused.slice(0, 120)}). Espere algumas horas e reprocesse.` });
        continue;
      }
      if (index > 0 && anidbGapMs() > 0) await deps.sleep(anidbGapMs());
      try {
        await settle(item, { incoming: incomingFromAnidb(await deps.fetchAnidb(idOf(item) as number)) });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // "Banned" / limite estourado: insistir só piora o bloqueio — o resto do lote fica para depois.
        if (/banned|555|flood|too many/i.test(message)) refused = message;
        await settle(item, /no such anime|not found|404/i.test(message) ? { state: "NOT_FOUND", message: "O AniDB não tem esta obra." } : { state: "FAILED", message: `O AniDB não respondeu: ${message.slice(0, 200)}` });
      }
      await prisma.adminJob.update({ where: { seq }, data: { processed, progressNote: `Coletando no AniDB: ${processed} de ${items.length}`, heartbeatAt: new Date() } }).catch(() => undefined);
    }
  } else {
    const ids = items.map(idOf).filter((x): x is number => x !== null);
    let failure: string | null = null;
    const found = new Map<number, Incoming>();
    try {
      if (source === "kitsu") for (const k of ids.length ? await deps.fetchKitsu(ids) : []) found.set(k.kitsuId, incomingFromKitsu(k));
      else for (const m of ids.length ? await deps.fetchByIds(ids) : []) found.set(m.id, incomingFromAniList(m));
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    for (const item of items) {
      const id = idOf(item);
      const incoming = id !== null ? found.get(id) : undefined;
      if (failure) await settle(item, { state: "FAILED", message: `A ${label} não respondeu: ${failure.slice(0, 200)}` });
      else if (!incoming) await settle(item, { state: "NOT_FOUND", message: `A ${label} não devolveu esta obra.` });
      else await settle(item, { incoming });
    }
  }
  await prisma.adminJob.update({ where: { seq }, data: { stage: "REVIEW", progressNote: null, processed: items.length } });
}

// ---------- 5. Seleção de campos ----------

/**
 * Escolhe os campos: `fields` vale para todas as obras (só onde a fonte trouxe valor diferente); protegidos só entram
 * com `includeProtected`; `perItem` substitui a escolha de obras específicas (exceções).
 */
export async function selectFields(seq: number, input: { fields: string[]; includeProtected: boolean; perItem?: Record<string, string[]> }): Promise<{ ok: true; selected: number } | { ok: false; status: number; error: string }> {
  const job = await prisma.adminJob.findUnique({ where: { seq } });
  if (!job || job.kind !== "FIELD_UPDATE") return { ok: false, status: 404, error: "Lote não encontrado." };
  if (job.stage !== "REVIEW") return { ok: false, status: 409, error: "Este lote não está em revisão." };
  const wanted = new Set(input.fields.filter((f): f is UpdatableField => (UPDATABLE_FIELDS as string[]).includes(f)));
  const items = await prisma.fieldUpdateItem.findMany({ where: { jobSeq: seq, state: "COLLECTED" } });
  let selected = 0;
  for (const item of items) {
    const diff = parseDiff(item);
    const own = input.perItem?.[item.id];
    const pick = own ? new Set(own) : wanted;
    const fields = diff.filter((d) => d.changed && pick.has(d.field) && (!d.protected || input.includeProtected || Boolean(own))).map((d) => d.field);
    selected += fields.length;
    await prisma.fieldUpdateItem.update({ where: { id: item.id }, data: { selectedJson: JSON.stringify(fields) } });
  }
  return { ok: true, selected };
}

// ---------- 6. Prévia ----------

export type FieldUpdatePreview = {
  works: number;
  affected: number;
  fields: Partial<Record<UpdatableField, number>>;
  ignored: number;
  unchanged: number;
  protectedKept: number;
  protectedOverwritten: number;
  notFound: number;
  failed: number;
  calendarImpact: number;
  publicImpact: number;
  needsConfirmation: boolean;
};

export async function previewFieldUpdate(seq: number): Promise<FieldUpdatePreview> {
  const items = await prisma.fieldUpdateItem.findMany({ where: { jobSeq: seq } });
  const preview: FieldUpdatePreview = { works: items.length, affected: 0, fields: {}, ignored: 0, unchanged: 0, protectedKept: 0, protectedOverwritten: 0, notFound: 0, failed: 0, calendarImpact: 0, publicImpact: 0, needsConfirmation: false };
  for (const item of items) {
    if (item.state === "NOT_FOUND") preview.notFound += 1;
    if (item.state === "FAILED") preview.failed += 1;
    if (item.state === "SKIPPED") preview.ignored += 1;
    if (item.state !== "COLLECTED") continue;
    const diff = parseDiff(item);
    const selected = new Set(parseSelected(item));
    if (!diff.some((d) => d.changed)) preview.unchanged += 1;
    if (selected.size === 0) continue;
    preview.affected += 1;
    for (const f of selected) preview.fields[f] = (preview.fields[f] ?? 0) + 1;
    preview.protectedKept += diff.filter((d) => d.changed && d.protected && !selected.has(d.field)).length;
    preview.protectedOverwritten += diff.filter((d) => d.protected && selected.has(d.field)).length;
    if (["status", "episodes", "startDate", "endDate"].some((f) => selected.has(f as UpdatableField))) preview.calendarImpact += 1;
    if (["titleRomaji", "titleNative", "titleEnglish", "description", "coverImage", "genres"].some((f) => selected.has(f as UpdatableField))) preview.publicImpact += 1;
  }
  preview.needsConfirmation = preview.affected > LARGE_BATCH || preview.protectedOverwritten > 0;
  return preview;
}

// ---------- 7. Execução + 8. Resultado ----------

export type FieldUpdateResult = { processed: number; applied: number; unchanged: number; skipped: number; conflicts: number; failed: number };

export async function applyFieldUpdate(seq: number, confirm: boolean, actor: ChangeActor): Promise<{ ok: true; result: FieldUpdateResult } | { ok: false; status: number; error: string }> {
  const job = await prisma.adminJob.findUnique({ where: { seq } });
  if (!job || job.kind !== "FIELD_UPDATE") return { ok: false, status: 404, error: "Lote não encontrado." };
  if (job.stage !== "REVIEW" || job.state !== "RUNNING") return { ok: false, status: 409, error: "Este lote não está pronto para executar (já executado ou em coleta)." };
  const preview = await previewFieldUpdate(seq);
  if (preview.needsConfirmation && !confirm) return { ok: false, status: 400, error: `Operação grande ou sobre valores protegidos (${preview.affected} obras, ${preview.protectedOverwritten} campo(s) protegido(s)): confirme explicitamente.` };
  // Trava: só uma execução por lote (a etapa muda antes de começar).
  const locked = await prisma.adminJob.updateMany({ where: { seq, stage: "REVIEW" }, data: { stage: "APPLY", progressNote: "Aplicando…" } });
  if (locked.count === 0) return { ok: false, status: 409, error: "Este lote já está sendo executado." };

  const items = await prisma.fieldUpdateItem.findMany({ where: { jobSeq: seq, state: "COLLECTED" } });
  const result: FieldUpdateResult = { processed: 0, applied: 0, unchanged: 0, skipped: 0, conflicts: 0, failed: 0 };
  for (const item of items) {
    result.processed += 1;
    const selected = parseSelected(item);
    if (selected.length === 0) {
      result.skipped += 1;
      await prisma.fieldUpdateItem.update({ where: { id: item.id }, data: { state: "SKIPPED", message: "Nenhum campo escolhido." } });
      continue;
    }
    try {
      const diff = new Map(parseDiff(item).map((d) => [d.field, d]));
      const outcome = await prisma.$transaction(async (tx) => {
        const entry = await tx.catalogEntry.findUnique({ where: { id: item.catalogEntryId } });
        if (!entry) return { state: "FAILED", message: "A obra não existe mais." };
        // Conflito: o valor mudou entre a coleta e a execução (outra edição, importação ou curadoria).
        const moved = selected.filter((f) => comparable(f, (entry as Record<string, unknown>)[f]) !== diff.get(f)?.current);
        if (moved.length) return { state: "CONFLICT", message: `Mudou desde a coleta: ${moved.map((f) => FIELD_UPDATE_LABELS[f]).join(", ")}. Recolete.` };
        const data: Record<string, unknown> = {};
        for (const f of selected) data[f] = toColumn(f, diff.get(f)?.incoming ?? null);
        const before = Object.fromEntries(selected.map((f) => [f, (entry as Record<string, unknown>)[f]]));
        const applied = selected.filter((f) => normalizeValue(before[f]) !== normalizeValue(data[f]));
        if (applied.length === 0) return { state: "UNCHANGED", message: null };
        // Campo protegido escolhido de propósito volta a seguir a fonte.
        const manualFields = entry.manualFields.filter((f) => !applied.includes(f as UpdatableField));
        const updated = await tx.catalogEntry.update({ where: { id: entry.id }, data: { ...data, ...(manualFields.length !== entry.manualFields.length ? { manualFields } : {}) } });
        await recordChanges(tx, { origin: "IMPORT", actor, entity: "CatalogEntry", entityId: entry.id, catalogEntryId: entry.id, changes: applied.map((f) => ({ field: f, before: before[f], after: data[f] })), reason: `Atualização seletiva · lote #${seq}`, jobSeq: seq, batchId: `field-update-${seq}` });
        await propagateWork(tx, updated, applied);
        return { state: "APPLIED", message: `${applied.length} campo(s)` };
      });
      if (outcome.state === "APPLIED") result.applied += 1;
      else if (outcome.state === "UNCHANGED") result.unchanged += 1;
      else if (outcome.state === "CONFLICT") result.conflicts += 1;
      else result.failed += 1;
      await prisma.fieldUpdateItem.update({ where: { id: item.id }, data: { state: outcome.state, message: outcome.message, appliedAt: new Date() } });
    } catch (error) {
      result.failed += 1;
      await prisma.fieldUpdateItem.update({ where: { id: item.id }, data: { state: "FAILED", message: (error instanceof Error ? error.message : String(error)).slice(0, 300) } });
    }
    await prisma.adminJob.update({ where: { seq }, data: { processed: result.processed } }).catch(() => undefined);
  }
  await prisma.adminJob.update({ where: { seq }, data: { state: "SUCCESS", stage: "DONE", progressNote: null, finishedAt: new Date(), resultJson: JSON.stringify(result) } });
  await prisma.adminLog.create({ data: { jobSeq: seq, source: FIELD_UPDATE_SOURCES[sourceOfJob(job.source)].label, event: "Field update applied", message: `Lote #${seq}: ${result.applied} atualizada(s), ${result.unchanged} sem mudança, ${result.skipped} ignorada(s), ${result.conflicts} conflito(s), ${result.failed} falha(s).`, context: "Atualização seletiva", adminName: actor.name } });
  return { ok: true, result };
}

/** Reprocessa os itens elegíveis (falha, não encontrado, conflito): voltam para a coleta e o lote volta à revisão. */
export async function retryFieldUpdate(seq: number, deps: FieldUpdateDeps = defaultFieldUpdateDeps): Promise<{ ok: true; retried: number } | { ok: false; status: number; error: string }> {
  const job = await prisma.adminJob.findUnique({ where: { seq } });
  if (!job || job.kind !== "FIELD_UPDATE") return { ok: false, status: 404, error: "Lote não encontrado." };
  if (job.stage === "APPLY" || job.stage === "COLLECT") return { ok: false, status: 409, error: "O lote está em andamento." };
  const source = sourceOfJob(job.source);
  if (source === "anidb" && (await aliveExclusiveJob("ANIDB_EPISODES"))) return { ok: false, status: 409, error: "O lote de episódios do AniDB está rodando. Espere terminar." };
  // Lotes antigos (só AniList) guardavam o identificador em `anilistId`.
  const hasId = source === "anilist" ? { OR: [{ sourceId: { not: null } }, { anilistId: { not: null } }] } : { sourceId: { not: null } };
  const { count } = await prisma.fieldUpdateItem.updateMany({ where: { jobSeq: seq, state: { in: ["FAILED", "NOT_FOUND", "CONFLICT"] }, ...hasId }, data: { state: "PENDING", message: null } });
  if (count === 0) return { ok: false, status: 400, error: "Não há itens para reprocessar." };
  await prisma.adminJob.update({ where: { seq }, data: { state: "RUNNING", stage: "COLLECT", finishedAt: null, processed: 0, progressNote: "Recoletando…" } });
  if (source === "anidb") void collect(seq, deps).catch(() => prisma.adminJob.update({ where: { seq }, data: { stage: "REVIEW", progressNote: null } }).catch(() => undefined));
  else await collect(seq, deps);
  return { ok: true, retried: count };
}
