import type { CatalogEntry, FieldUpdateItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fuzzyDateToISO, getOfficialSiteUrl, type AniListMedia } from "@/lib/anilist";
import { recordChanges, normalizeValue, type ChangeActor } from "@/lib/changeLog";
import { defaultImportDeps, MAX_SELECTION, type ImportDeps } from "@/lib/anilistImport";
import { ADULT_MARKER, genresFromAniList, visibleGenres } from "@/lib/genreTaxonomy";
import { propagateWork } from "@/lib/workPropagation";

/**
 * Atualização seletiva de campos (Fase 6, §11 e Cenário F). Etapas:
 *  1. seleção (obras escolhidas ou um filtro do catálogo) → 2. coleta na fonte, sem tocar no catálogo →
 *  3/4. normalização e comparação campo a campo (atual × recebido, protegido, sem valor na fonte) →
 *  5. o admin escolhe os campos (em grupo, com exceções por obra) → 6. prévia → 7. execução item a item, com falha
 *  isolada → 8. resultado e reprocessamento das falhas.
 * Regras: campo ausente na resposta não vira vazio; valor protegido só muda se o admin escolher de propósito; a
 * execução confere se o valor atual ainda é o da coleta (senão, conflito); tudo vai para o ChangeLog com o lote.
 */
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

export async function createFieldUpdate(catalogEntryIds: string[], actor: ChangeActor & { id: string; name: string }, label: string, deps: ImportDeps = defaultImportDeps): Promise<{ ok: true; seq: number } | { ok: false; status: number; error: string }> {
  const unique = [...new Set(catalogEntryIds)];
  if (unique.length === 0) return { ok: false, status: 400, error: "Escolha ao menos uma obra." };
  if (unique.length > MAX_SELECTION) return { ok: false, status: 400, error: `No máximo ${MAX_SELECTION} obras por lote (a AniList limita as consultas). Refine o filtro.` };
  const running = await prisma.adminJob.count({ where: { kind: "FIELD_UPDATE", state: "RUNNING", stage: "COLLECT" } });
  if (running > 0) return { ok: false, status: 409, error: "Já há uma coleta em andamento. Espere terminar." };
  const entries = await prisma.catalogEntry.findMany({ where: { id: { in: unique } }, select: { id: true, anilistId: true, titleRomaji: true, titleNative: true } });
  const job = await prisma.adminJob.create({ data: { kind: "FIELD_UPDATE", source: "AniList", season: label.slice(0, 120), state: "RUNNING", stage: "COLLECT", total: entries.length, progressNote: "Coletando na AniList…", adminId: actor.id, adminName: actor.name } });
  await prisma.fieldUpdateItem.createMany({ data: entries.map((e) => ({ jobSeq: job.seq, catalogEntryId: e.id, anilistId: e.anilistId, title: e.titleNative ?? e.titleRomaji, state: e.anilistId === null ? "SKIPPED" : "PENDING", message: e.anilistId === null ? "Sem AniList ID: a AniList não tem esta obra." : null })) });
  await collect(job.seq, deps);
  return { ok: true, seq: job.seq };
}

/** Coleta (ou recoleta) os itens PENDING do lote. Uma falha de rede marca os itens como FAILED, sem perder o resto. */
export async function collect(seq: number, deps: ImportDeps = defaultImportDeps): Promise<void> {
  const items = await prisma.fieldUpdateItem.findMany({ where: { jobSeq: seq, state: "PENDING" } });
  const ids = items.map((i) => i.anilistId).filter((x): x is number => x !== null);
  let media: AniListMedia[] = [];
  let failure: string | null = null;
  try {
    media = ids.length ? await deps.fetchByIds(ids) : [];
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  const byId = new Map(media.map((m) => [m.id, m]));
  const entries = await prisma.catalogEntry.findMany({ where: { id: { in: items.map((i) => i.catalogEntryId) } } });
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const now = new Date();
  for (const item of items) {
    const entry = entryById.get(item.catalogEntryId);
    if (!entry) {
      await prisma.fieldUpdateItem.update({ where: { id: item.id }, data: { state: "FAILED", message: "A obra não existe mais no catálogo." } });
      continue;
    }
    if (failure) {
      await prisma.fieldUpdateItem.update({ where: { id: item.id }, data: { state: "FAILED", message: `A AniList não respondeu: ${failure.slice(0, 200)}` } });
      continue;
    }
    const m = item.anilistId !== null ? byId.get(item.anilistId) : undefined;
    if (!m) {
      await prisma.fieldUpdateItem.update({ where: { id: item.id }, data: { state: "NOT_FOUND", message: "A AniList não devolveu esta obra." } });
      continue;
    }
    const diff = diffEntry(entry, incomingFromAniList(m));
    await prisma.fieldUpdateItem.update({ where: { id: item.id }, data: { state: "COLLECTED", diffJson: JSON.stringify(diff), selectedJson: JSON.stringify([]), collectedAt: now, message: null } });
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
  await prisma.adminLog.create({ data: { jobSeq: seq, source: "AniList", event: "Field update applied", message: `Lote #${seq}: ${result.applied} atualizada(s), ${result.unchanged} sem mudança, ${result.skipped} ignorada(s), ${result.conflicts} conflito(s), ${result.failed} falha(s).`, context: "Atualização seletiva", adminName: actor.name } });
  return { ok: true, result };
}

/** Reprocessa os itens elegíveis (falha, não encontrado, conflito): voltam para a coleta e o lote volta à revisão. */
export async function retryFieldUpdate(seq: number, deps: ImportDeps = defaultImportDeps): Promise<{ ok: true; retried: number } | { ok: false; status: number; error: string }> {
  const job = await prisma.adminJob.findUnique({ where: { seq } });
  if (!job || job.kind !== "FIELD_UPDATE") return { ok: false, status: 404, error: "Lote não encontrado." };
  if (job.stage === "APPLY" || job.stage === "COLLECT") return { ok: false, status: 409, error: "O lote está em andamento." };
  const { count } = await prisma.fieldUpdateItem.updateMany({ where: { jobSeq: seq, state: { in: ["FAILED", "NOT_FOUND", "CONFLICT"] }, anilistId: { not: null } }, data: { state: "PENDING", message: null } });
  if (count === 0) return { ok: false, status: 400, error: "Não há itens para reprocessar." };
  await prisma.adminJob.update({ where: { seq }, data: { state: "RUNNING", stage: "COLLECT", finishedAt: null, progressNote: "Recoletando…" } });
  await collect(seq, deps);
  return { ok: true, retried: count };
}
