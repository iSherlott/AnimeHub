import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Histórico de alterações (Fase 2, ADR 0008): uma linha por campo alterado, com o valor de antes e o de depois (em JSON),
 * quem fez, de onde veio (admin, importação, curadoria, job) e por quê. É o que a ficha da obra mostra como histórico e o
 * que "desfazer" lê. Toda gravação que muda um campo canônico passa por `recordChanges`.
 */
/** SOURCE = a própria fonte mudou o valor (ex.: a AniList trocou a data de um episódio). */
export type ChangeOrigin = "ADMIN" | "IMPORT" | "CURATION" | "JOB" | "SYSTEM" | "SOURCE";
export type ChangeActor = { id: string | null; name: string | null };
export type FieldChange = { field: string; before: unknown; after: unknown };

type Db = Prisma.TransactionClient | typeof prisma;

/** Valor comparável e guardável: datas viram ISO, listas e objetos viram JSON; nulo e indefinido são o mesmo vazio. */
export function normalizeValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  return JSON.stringify(value);
}

/** Os campos que mudaram entre `before` e `after` (só os pedidos em `fields`, ou todos os de `after`). */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[] = Object.keys(after)): FieldChange[] {
  const out: FieldChange[] = [];
  for (const field of fields) {
    if (!(field in after)) continue;
    if (normalizeValue(before[field]) === normalizeValue(after[field])) continue;
    out.push({ field, before: before[field] ?? null, after: after[field] ?? null });
  }
  return out;
}

export async function recordChanges(
  db: Db,
  input: {
    origin: ChangeOrigin;
    actor?: ChangeActor | null;
    entity: string;
    entityId: string;
    catalogEntryId?: string | null;
    changes: FieldChange[];
    reason?: string | null;
    jobSeq?: number | null;
    batchId?: string | null;
  }
): Promise<number> {
  if (input.changes.length === 0) return 0;
  const result = await db.changeLog.createMany({
    data: input.changes.map((c) => ({
      origin: input.origin,
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? null,
      entity: input.entity,
      entityId: input.entityId,
      catalogEntryId: input.catalogEntryId ?? null,
      field: c.field,
      before: normalizeValue(c.before),
      after: normalizeValue(c.after),
      reason: input.reason ?? null,
      jobSeq: input.jobSeq ?? null,
      batchId: input.batchId ?? null,
    })),
  });
  return result.count;
}

export type ChangeRow = { id: string; at: string; actorName: string | null; origin: string; entity: string; entityId: string; field: string; before: unknown; after: unknown; reason: string | null; jobSeq: number | null; batchId: string | null };

const parse = (value: string | null): unknown => {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/** Histórico paginado (mais recente primeiro) de uma obra ou de um registro. */
export async function changeHistory(where: { catalogEntryId?: string; entity?: string; entityId?: string; batchId?: string }, page = 0, size = 50): Promise<{ rows: ChangeRow[]; total: number }> {
  const filter: Prisma.ChangeLogWhereInput = {
    ...(where.catalogEntryId ? { catalogEntryId: where.catalogEntryId } : {}),
    ...(where.entity ? { entity: where.entity } : {}),
    ...(where.entityId ? { entityId: where.entityId } : {}),
    ...(where.batchId ? { batchId: where.batchId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.changeLog.findMany({ where: filter, orderBy: [{ at: "desc" }, { id: "desc" }], skip: page * size, take: size }),
    prisma.changeLog.count({ where: filter }),
  ]);
  return {
    total,
    rows: rows.map((r) => ({ id: r.id, at: r.at.toISOString(), actorName: r.actorName, origin: r.origin, entity: r.entity, entityId: r.entityId, field: r.field, before: parse(r.before), after: parse(r.after), reason: r.reason, jobSeq: r.jobSeq, batchId: r.batchId })),
  };
}
