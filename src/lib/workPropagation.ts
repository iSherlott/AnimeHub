import type { CatalogEntry, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Propagação da obra para as cópias (Fase 3, docs/arquitetura/fonte-de-verdade.md). O catálogo é a fonte de verdade; a
 * página pública (`Production`), os itens de lista (`Anime`) e a agenda (`AiringScheduleEntry`) guardam CÓPIAS de alguns
 * campos. Quando um desses campos muda na obra, este é o único lugar que leva o valor às cópias — e só os campos que cada
 * cópia copia, nunca os pessoais (estado, nota, favorito, anotações de quem acompanha).
 */
type Db = Prisma.TransactionClient | typeof prisma;

/** Campo da obra → campo da cópia (mesmo nome em todas). */
const PRODUCTION_FIELDS = ["titleRomaji", "titleEnglish", "titleNative", "coverImage", "bannerImage", "description", "format", "episodes", "status", "season", "seasonYear", "genres", "officialSite"] as const;
const LIST_FIELDS = ["titleRomaji", "titleEnglish", "titleNative", "coverImage", "bannerImage", "description", "format", "episodes", "status", "season", "seasonYear", "genres", "officialSite"] as const;
const SCHEDULE_FIELDS = ["titleRomaji", "titleEnglish", "titleNative", "coverImage", "bannerImage", "description", "genres"] as const;

export const PROPAGATED_FIELDS: ReadonlySet<string> = new Set([...PRODUCTION_FIELDS, ...LIST_FIELDS, ...SCHEDULE_FIELDS]);

function pick(entry: Partial<CatalogEntry>, fields: readonly string[], changed: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (changed.has(f)) out[f] = (entry as Record<string, unknown>)[f] ?? null;
  return out;
}

/** Leva às cópias os campos `changed` da obra `entry` (com os valores já gravados). Devolve quantas linhas mudaram. */
export async function propagateWork(db: Db, entry: CatalogEntry, changed: Iterable<string>): Promise<{ productions: number; listEntries: number; schedule: number }> {
  const set = new Set(changed);
  const byWork = (anilistIdField = true) => ({ OR: [{ catalogEntryId: entry.id }, ...(anilistIdField && entry.anilistId !== null ? [{ anilistId: entry.anilistId }] : [])] });
  const production = pick(entry, PRODUCTION_FIELDS, set);
  const list = pick(entry, LIST_FIELDS, set);
  const schedule = pick(entry, SCHEDULE_FIELDS, set);
  // `titleRomaji` é obrigatório nas cópias: nunca leva vazio.
  for (const data of [production, list, schedule]) if ("titleRomaji" in data && !data.titleRomaji) delete data.titleRomaji;
  const [p, l, s] = await Promise.all([
    Object.keys(production).length ? db.production.updateMany({ where: byWork(), data: production }) : { count: 0 },
    Object.keys(list).length ? db.anime.updateMany({ where: byWork(), data: list }) : { count: 0 },
    Object.keys(schedule).length ? db.airingScheduleEntry.updateMany({ where: byWork(), data: schedule }) : { count: 0 },
  ]);
  return { productions: p.count, listEntries: l.count, schedule: s.count };
}

/** Tira de um conjunto de dados vindo de fonte externa os campos que o admin protegeu na obra. */
export function stripProtected<T extends Record<string, unknown>>(data: T, manualFields: readonly string[] | null | undefined): T {
  if (!manualFields || manualFields.length === 0) return data;
  const out = { ...data };
  for (const f of manualFields) delete (out as Record<string, unknown>)[f];
  return out;
}
