import type { CatalogEntry } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { diffFields, recordChanges, type ChangeActor } from "@/lib/changeLog";
import { activeGenreKeys } from "@/lib/genres";
import { propagateWork } from "@/lib/workPropagation";
import { GENRE_TAXONOMY } from "@/lib/genreTaxonomy";
import { ADULT_GENRE } from "@/lib/contentPolicy";
import { KINDS } from "@/lib/curation/kind";

/**
 * Edição da obra pelo admin (Fase 3). Só os campos canônicos editáveis passam; cada valor é validado; o que o admin
 * corrige fica protegido (`manualFields`) contra a importação e a curadoria; a gravação confere a versão (quem salvou por
 * último não apaga sem saber a alteração de outra pessoa), registra o histórico e leva o valor às cópias.
 */
export const FORMATS = ["TV", "TV_SHORT", "MOVIE", "OVA", "ONA", "SPECIAL", "MUSIC"] as const;
export const STATUSES = ["RELEASING", "FINISHED", "NOT_YET_RELEASED", "HIATUS", "CANCELLED"] as const;
export const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;
const GENRES = new Set<string>([...GENRE_TAXONOMY, ADULT_GENRE]);

export type EditableField =
  | "titleRomaji"
  | "titleEnglish"
  | "titleNative"
  | "description"
  | "descriptionPt"
  | "format"
  | "kind"
  | "status"
  | "episodes"
  | "season"
  | "seasonYear"
  | "startDate"
  | "endDate"
  | "genres"
  | "coverImage"
  | "bannerImage"
  | "officialSite";

export const EDITABLE_FIELDS: readonly EditableField[] = ["titleRomaji", "titleEnglish", "titleNative", "description", "descriptionPt", "format", "kind", "status", "episodes", "season", "seasonYear", "startDate", "endDate", "genres", "coverImage", "bannerImage", "officialSite"];

export const FIELD_LABELS: Record<EditableField, string> = {
  titleRomaji: "Título (rōmaji)",
  titleEnglish: "Título internacional",
  titleNative: "Título japonês",
  description: "Sinopse original",
  descriptionPt: "Sinopse em português",
  format: "Formato",
  kind: "Tipo",
  status: "Situação",
  episodes: "Episódios (informado)",
  season: "Temporada",
  seasonYear: "Ano",
  startDate: "Estreia",
  endDate: "Fim",
  genres: "Gêneros",
  coverImage: "Capa",
  bannerImage: "Banner",
  officialSite: "Site oficial",
};

type Parsed = Partial<Record<EditableField, unknown>>;
const text = (max: number, required = false) => (v: unknown): { ok: true; value: string | null } | { ok: false } => {
  if (v === null || (typeof v === "string" && v.trim() === "")) return required ? { ok: false } : { ok: true, value: null };
  return typeof v === "string" && v.trim().length <= max ? { ok: true, value: v.trim() } : { ok: false };
};
const oneOf = (values: readonly string[]) => (v: unknown) => (v === null || v === "" ? { ok: true as const, value: null } : typeof v === "string" && values.includes(v) ? { ok: true as const, value: v } : { ok: false as const });
const int = (min: number, max: number) => (v: unknown) => (v === null || v === "" ? { ok: true as const, value: null } : Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? { ok: true as const, value: v as number } : { ok: false as const });
const url = (v: unknown) => (v === null || v === "" ? { ok: true as const, value: null } : typeof v === "string" && v.length <= 500 && /^https?:\/\/\S+$/.test(v.trim()) ? { ok: true as const, value: v.trim() } : { ok: false as const });
const date = (v: unknown) => {
  if (v === null || v === "") return { ok: true as const, value: null };
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false as const };
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? { ok: false as const } : { ok: true as const, value: d };
};
/** Gêneros aceitos: o vocabulário padrão do código, ou o atual do banco que `editWork` passa (Fase 7). */
const genresRule = (allowed: ReadonlySet<string>) => (v: unknown) => {
  if (v === null) return { ok: true as const, value: null };
  if (!Array.isArray(v) || v.some((g) => typeof g !== "string" || !allowed.has(g))) return { ok: false as const };
  const list = Array.from(new Set(v as string[]));
  return { ok: true as const, value: list.length ? list.join(",") : null };
};
const genres = genresRule(GENRES);

const RULES: Record<EditableField, (v: unknown) => { ok: true; value: unknown } | { ok: false }> = {
  titleRomaji: text(300, true),
  titleEnglish: text(300),
  titleNative: text(300),
  description: text(10_000),
  descriptionPt: text(10_000),
  format: oneOf(FORMATS),
  kind: oneOf(KINDS),
  status: oneOf(STATUSES),
  episodes: int(1, 5000),
  season: oneOf(SEASONS),
  seasonYear: int(1900, 2100),
  startDate: date,
  endDate: date,
  genres,
  coverImage: url,
  bannerImage: url,
  officialSite: url,
};

const MESSAGES: Record<EditableField, string> = {
  titleRomaji: "obrigatório, até 300 caracteres",
  titleEnglish: "até 300 caracteres",
  titleNative: "até 300 caracteres",
  description: "até 10.000 caracteres",
  descriptionPt: "até 10.000 caracteres",
  format: `um de ${FORMATS.join(", ")}`,
  kind: `um de ${KINDS.join(", ")}`,
  status: `um de ${STATUSES.join(", ")}`,
  episodes: "número inteiro de 1 a 5000",
  season: `um de ${SEASONS.join(", ")}`,
  seasonYear: "ano de 1900 a 2100",
  startDate: "data no formato AAAA-MM-DD",
  endDate: "data no formato AAAA-MM-DD",
  genres: "lista de gêneros da taxonomia",
  coverImage: "endereço http(s)",
  bannerImage: "endereço http(s)",
  officialSite: "endereço http(s)",
};

export type EditInput = { expectedUpdatedAt: string; changes: Record<string, unknown>; reason?: string | null; protect?: boolean; unprotect?: string[] };

/** Valida o pedido; devolve os valores prontos para gravar ou os erros por campo. */
export function validateEdit(input: unknown, genreKeys?: ReadonlySet<string>): { ok: true; value: { expectedUpdatedAt: Date; data: Parsed; reason: string | null; protect: boolean; unprotect: EditableField[] } } | { ok: false; errors: Record<string, string> } {
  const body = (input ?? {}) as Partial<EditInput>;
  const errors: Record<string, string> = {};
  const expected = typeof body.expectedUpdatedAt === "string" ? new Date(body.expectedUpdatedAt) : null;
  if (!expected || Number.isNaN(expected.getTime())) errors.expectedUpdatedAt = "versão da obra ausente (recarregue a página)";
  const changes = body.changes && typeof body.changes === "object" ? body.changes : {};
  const data: Parsed = {};
  for (const [field, value] of Object.entries(changes)) {
    if (!(EDITABLE_FIELDS as readonly string[]).includes(field)) {
      errors[field] = "campo não editável";
      continue;
    }
    const r = (field === "genres" && genreKeys ? genresRule(genreKeys) : RULES[field as EditableField])(value);
    if (!r.ok) errors[field] = MESSAGES[field as EditableField];
    else data[field as EditableField] = r.value;
  }
  const unprotect = Array.isArray(body.unprotect) ? body.unprotect.filter((f): f is EditableField => (EDITABLE_FIELDS as readonly string[]).includes(f)) : [];
  if (Object.keys(data).length === 0 && unprotect.length === 0 && Object.keys(errors).length === 0) errors.changes = "nada para alterar";
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { expectedUpdatedAt: expected as Date, data, reason, protect: body.protect !== false, unprotect } };
}

export type EditResult =
  | { ok: true; entry: CatalogEntry; changed: string[]; propagated: { productions: number; listEntries: number; schedule: number } }
  | { ok: false; status: 404 | 409 | 400; error: string; errors?: Record<string, string>; current?: CatalogEntry };

export async function editWork(id: string, input: unknown, actor: ChangeActor): Promise<EditResult> {
  const parsed = validateEdit(input, new Set([...(await activeGenreKeys()), ADULT_GENRE]));
  if (!parsed.ok) return { ok: false, status: 400, error: "Alguns campos não são válidos.", errors: parsed.errors };
  const { expectedUpdatedAt, data, reason, protect, unprotect } = parsed.value;

  return prisma.$transaction(async (tx) => {
    const entry = await tx.catalogEntry.findUnique({ where: { id } });
    if (!entry) return { ok: false as const, status: 404 as const, error: "Obra não encontrada." };
    if (entry.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      return { ok: false as const, status: 409 as const, error: "A obra mudou depois que você abriu a página (outra edição, importação ou curadoria). Revise os valores atuais e salve de novo.", current: entry };
    }
    const next: Record<string, unknown> = { ...data };
    const start = ("startDate" in data ? data.startDate : entry.startDate) as Date | null;
    const end = ("endDate" in data ? data.endDate : entry.endDate) as Date | null;
    if (start && end && start > end) return { ok: false as const, status: 400 as const, error: "A estreia não pode ser depois do fim.", errors: { endDate: "depois da estreia" } };

    const changes = diffFields(entry as unknown as Record<string, unknown>, next);
    const changedFields = changes.map((c) => c.field);
    // Campos protegidos: o que o admin corrigiu agora passa a valer sobre a fonte; "liberar" devolve o campo à fonte.
    const manual = new Set(entry.manualFields);
    if (protect) for (const f of changedFields) manual.add(f);
    for (const f of unprotect) manual.delete(f);
    const manualFields = Array.from(manual).sort();
    const manualChanged = manualFields.join(",") !== [...entry.manualFields].sort().join(",");
    if (changes.length === 0 && !manualChanged) return { ok: false as const, status: 400 as const, error: "Os valores são iguais aos atuais: nada mudou." };

    // Sinopse em português escrita pelo admin (Fase 7): passa a ser "manual"; apagada, volta a pendente.
    const ptState = changedFields.includes("descriptionPt")
      ? next.descriptionPt
        ? { descriptionPtStatus: "MANUAL", descriptionPtSource: "admin", descriptionPtReviewedBy: actor.name, descriptionPtReviewedAt: new Date() }
        : { descriptionPtStatus: null, descriptionPtSource: null, descriptionPtReviewedBy: null, descriptionPtReviewedAt: null }
      : {};
    const updated = await tx.catalogEntry.update({ where: { id }, data: { ...(next as object), ...ptState, manualFields } });
    await recordChanges(tx, { origin: "ADMIN", actor, entity: "CatalogEntry", entityId: id, catalogEntryId: id, changes: [...changes, ...(manualChanged ? [{ field: "manualFields", before: entry.manualFields, after: manualFields }] : [])], reason });
    const propagated = await propagateWork(tx, updated, changedFields);
    return { ok: true as const, entry: updated, changed: changedFields, propagated };
  });
}

/** O que muda ao tirar (ou pôr) a obra da plataforma — para o admin confirmar sabendo o impacto. */
export async function visibilityImpact(id: string): Promise<{ followers: number; futureEpisodes: number; productions: number; posts: number } | null> {
  const entry = await prisma.catalogEntry.findUnique({ where: { id }, select: { id: true, anilistId: true } });
  if (!entry) return null;
  const byWork = { OR: [{ catalogEntryId: id }, ...(entry.anilistId !== null ? [{ anilistId: entry.anilistId }] : [])] };
  const [followers, futureEpisodes, productions, posts] = await Promise.all([
    prisma.anime.count({ where: byWork }),
    prisma.airingScheduleEntry.count({ where: { ...byWork, airingAt: { gt: new Date() } } }),
    prisma.production.count({ where: byWork }),
    entry.anilistId !== null ? prisma.post.count({ where: { anilistId: entry.anilistId } }) : Promise.resolve(0),
  ]);
  return { followers, futureEpisodes, productions, posts };
}

/** Publica ou despublica a obra (não apaga nada: as cópias e a agenda ficam, só deixam de aparecer). */
export async function setVisibility(id: string, onPlatform: boolean, reason: string | null, actor: ChangeActor): Promise<CatalogEntry | null> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.catalogEntry.findUnique({ where: { id } });
    if (!entry) return null;
    if (entry.onPlatform === onPlatform) return entry;
    const updated = await tx.catalogEntry.update({ where: { id }, data: { onPlatform } });
    await recordChanges(tx, { origin: "ADMIN", actor, entity: "CatalogEntry", entityId: id, catalogEntryId: id, changes: [{ field: "onPlatform", before: entry.onPlatform, after: onPlatform }], reason });
    return updated;
  });
}
