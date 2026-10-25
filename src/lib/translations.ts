import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordChanges, type ChangeActor } from "@/lib/changeLog";
import { htmlToPlainText } from "@/lib/plainText";
import { storeSynopsis } from "@/lib/synopsis";
import { translateText } from "@/lib/translate";

/**
 * Admin → Traduções (Fase 7, §13): a sinopse em português de cada obra com o estado dela — ausente (não há original),
 * pendente (há original, falta a tradução), automática, revisada (automática aprovada) ou manual (escrita pelo admin).
 * Revisada e manual ficam protegidas: a tradução automática nunca passa por cima delas.
 */
export const TRANSLATION_STATES = { ausente: "Sem original", pendente: "Pendente", automatica: "Automática", revisada: "Revisada", manual: "Manual" } as const;
export type TranslationState = keyof typeof TRANSLATION_STATES;
export const TRANSLATIONS_PAGE_SIZE = 30;

export function stateWhere(state: TranslationState): Prisma.CatalogEntryWhereInput {
  switch (state) {
    case "ausente":
      return { description: null, descriptionPt: null };
    case "pendente":
      return { description: { not: null }, descriptionPt: null };
    case "automatica":
      return { descriptionPt: { not: null }, OR: [{ descriptionPtStatus: "AUTO" }, { descriptionPtStatus: null }] };
    case "revisada":
      return { descriptionPt: { not: null }, descriptionPtStatus: "REVIEWED" };
    case "manual":
      return { descriptionPt: { not: null }, descriptionPtStatus: "MANUAL" };
  }
}

export function translationState(e: { description: string | null; descriptionPt: string | null; descriptionPtStatus: string | null }): TranslationState {
  if (!e.descriptionPt) return e.description ? "pendente" : "ausente";
  if (e.descriptionPtStatus === "REVIEWED") return "revisada";
  if (e.descriptionPtStatus === "MANUAL") return "manual";
  return "automatica";
}

export async function translationCounts(): Promise<Record<TranslationState, number>> {
  const base = { onPlatform: true };
  const entries = await Promise.all((Object.keys(TRANSLATION_STATES) as TranslationState[]).map(async (s) => [s, await prisma.catalogEntry.count({ where: { ...base, ...stateWhere(s) } })] as const));
  return Object.fromEntries(entries) as Record<TranslationState, number>;
}

export async function listTranslations(f: { estado: TranslationState; q: string; pagina: number }) {
  const where: Prisma.CatalogEntryWhereInput = {
    onPlatform: true,
    ...stateWhere(f.estado),
    ...(f.q ? { AND: [{ OR: [{ titleRomaji: { contains: f.q, mode: "insensitive" } }, { titleNative: { contains: f.q, mode: "insensitive" } }, { titleEnglish: { contains: f.q, mode: "insensitive" } }] }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.catalogEntry.count({ where }),
    prisma.catalogEntry.findMany({ where, orderBy: [{ titleRomaji: "asc" }, { id: "asc" }], skip: f.pagina * TRANSLATIONS_PAGE_SIZE, take: TRANSLATIONS_PAGE_SIZE, select: { id: true, anilistId: true, titleRomaji: true, titleNative: true, description: true, descriptionPt: true, descriptionPtStatus: true, descriptionPtSource: true, descriptionPtReviewedBy: true, descriptionPtReviewedAt: true, updatedAt: true } }),
  ]);
  return {
    total,
    page: f.pagina,
    pages: Math.max(1, Math.ceil(total / TRANSLATIONS_PAGE_SIZE)),
    rows: rows.map((r) => ({ ...r, original: htmlToPlainText(r.description), state: translationState(r) })),
  };
}

type Result = { ok: true } | { ok: false; status: number; error: string };

async function load(id: string) {
  return prisma.catalogEntry.findUnique({ where: { id }, select: { id: true, anilistId: true, description: true, descriptionPt: true, descriptionPtStatus: true, manualFields: true } });
}

/** Aprovar a automática: vira "revisada" e fica protegida. */
export async function approveTranslation(id: string, actor: ChangeActor): Promise<Result> {
  const e = await load(id);
  if (!e) return { ok: false, status: 404, error: "Obra não encontrada." };
  if (!e.descriptionPt) return { ok: false, status: 400, error: "Não há tradução para aprovar." };
  const manualFields = [...new Set([...e.manualFields, "descriptionPt"])].sort();
  await prisma.catalogEntry.update({ where: { id }, data: { descriptionPtStatus: "REVIEWED", descriptionPtReviewedBy: actor.name, descriptionPtReviewedAt: new Date(), manualFields } });
  await recordChanges(prisma, { origin: "ADMIN", actor, entity: "CatalogEntry", entityId: id, catalogEntryId: id, changes: [{ field: "descriptionPtStatus", before: e.descriptionPtStatus ?? "AUTO", after: "REVIEWED" }] });
  return { ok: true };
}

/** Rejeitar: a tradução sai (fica pendente) e o cache automático é descartado, para a próxima tradução ser nova. */
export async function rejectTranslation(id: string, reason: string | null, actor: ChangeActor): Promise<Result> {
  const e = await load(id);
  if (!e) return { ok: false, status: 404, error: "Obra não encontrada." };
  if (!e.descriptionPt) return { ok: false, status: 400, error: "Não há tradução para rejeitar." };
  await prisma.catalogEntry.update({ where: { id }, data: { descriptionPt: null, descriptionPtStatus: null, descriptionPtSource: null, descriptionPtReviewedBy: null, descriptionPtReviewedAt: null, manualFields: e.manualFields.filter((f) => f !== "descriptionPt") } });
  if (e.anilistId) await prisma.synopsisTranslation.deleteMany({ where: { anilistId: e.anilistId, lang: "pt" } });
  await recordChanges(prisma, { origin: "ADMIN", actor, entity: "CatalogEntry", entityId: id, catalogEntryId: id, changes: [{ field: "descriptionPt", before: e.descriptionPt, after: null }], reason: reason || "Tradução rejeitada" });
  return { ok: true };
}

/** Editar: o texto do admin vira "manual" e fica protegido. */
export async function editTranslation(id: string, text: string, actor: ChangeActor): Promise<Result> {
  const e = await load(id);
  if (!e) return { ok: false, status: 404, error: "Obra não encontrada." };
  const clean = text.trim();
  if (!clean || clean.length > 10_000) return { ok: false, status: 400, error: "Escreva a sinopse (até 10.000 caracteres)." };
  const manualFields = [...new Set([...e.manualFields, "descriptionPt"])].sort();
  await prisma.catalogEntry.update({ where: { id }, data: { descriptionPt: clean, descriptionPtStatus: "MANUAL", descriptionPtSource: "admin", descriptionPtReviewedBy: actor.name, descriptionPtReviewedAt: new Date(), manualFields } });
  await recordChanges(prisma, { origin: "ADMIN", actor, entity: "CatalogEntry", entityId: id, catalogEntryId: id, changes: [{ field: "descriptionPt", before: e.descriptionPt, after: clean }] });
  return { ok: true };
}

/** Reprocessar: traduz de novo o original agora. Revisada ou manual exigem rejeitar antes (não se sobrescreve). */
export async function retranslate(id: string): Promise<Result> {
  const e = await load(id);
  if (!e) return { ok: false, status: 404, error: "Obra não encontrada." };
  if (e.manualFields.includes("descriptionPt")) return { ok: false, status: 409, error: "Tradução revisada ou manual: rejeite antes de traduzir de novo." };
  const original = htmlToPlainText(e.description);
  if (!original) return { ok: false, status: 400, error: "A obra não tem sinopse original para traduzir." };
  try {
    const text = await translateText(original, "pt");
    await storeSynopsis({ entryId: e.id, anilistId: e.anilistId, lang: "pt", text });
    return { ok: true };
  } catch (error) {
    return { ok: false, status: 502, error: `O serviço de tradução não respondeu: ${(error instanceof Error ? error.message : String(error)).slice(0, 160)}` };
  }
}

export function pendingCsv(rows: Array<{ id: string; anilistId: number | null; titleRomaji: string; titleNative: string | null; state: TranslationState }>): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return ["id,anilistId,titulo,titulo_japones,estado", ...rows.map((r) => [r.id, r.anilistId, r.titleRomaji, r.titleNative, r.state].map(esc).join(","))].join("\n");
}
