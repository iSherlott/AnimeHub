import { prisma } from "@/lib/prisma";
import { recordChanges, type ChangeActor } from "@/lib/changeLog";

/**
 * Admin → Franquias (Fase 7, §10): a linha do tempo de uma franquia (`franchiseKey`) com ordem, papel e temporada de cada
 * obra. O admin reordena e salva; o que ele definir fica protegido (`manualFields`) e a auditoria das linhas do tempo não
 * muda mais. Cada salvamento é um lote no histórico e pode ser desfeito.
 */
export const TIMELINE_ROLES = { MAIN: "Principal (temporada)", RELATED: "Relacionada", SPECIAL: "Especial (OVA, ODA, filme)" } as const;
export type TimelineRole = keyof typeof TIMELINE_ROLES;
const TIMELINE_FIELDS = ["timelineOrder", "timelineRole", "timelineSeason"] as const;

export async function listFranchises(q: string, page = 0, size = 50) {
  const rows = await prisma.$queryRaw<Array<{ key: number; works: bigint; title: string | null; manual: bigint }>>`
    SELECT c."franchiseKey" AS key, COUNT(*) AS works,
           (SELECT r."titleRomaji" FROM "CatalogEntry" r WHERE r."anilistId" = c."franchiseKey" LIMIT 1) AS title,
           COUNT(*) FILTER (WHERE 'timelineOrder' = ANY (c."manualFields")) AS manual
    FROM "CatalogEntry" c
    WHERE c."franchiseKey" IS NOT NULL AND c."onPlatform" = true
    GROUP BY c."franchiseKey"
    HAVING ${q} = '' OR bool_or(c."titleRomaji" ILIKE ${`%${q}%`} OR coalesce(c."titleNative", '') ILIKE ${`%${q}%`})
    ORDER BY COUNT(*) DESC, c."franchiseKey"
    LIMIT ${size} OFFSET ${page * size}`;
  return rows.map((r) => ({ key: r.key, works: Number(r.works), title: r.title, manual: Number(r.manual) }));
}

export async function loadFranchise(key: number) {
  const ids = (await prisma.catalogEntry.findMany({ where: { franchiseKey: key }, select: { id: true } })).map((w) => w.id);
  const [works, issues, batches] = await Promise.all([
    prisma.catalogEntry.findMany({
      where: { franchiseKey: key },
      orderBy: [{ timelineOrder: "asc" }, { startDate: "asc" }, { titleRomaji: "asc" }],
      select: { id: true, anilistId: true, titleRomaji: true, titleNative: true, kind: true, format: true, season: true, seasonYear: true, startDate: true, timelineOrder: true, timelineRole: true, timelineSeason: true, manualFields: true, onPlatform: true },
    }),
    // Relações suspeitas: estreia antes do prequel, sem data, possível duplicada.
    prisma.curationIssue.findMany({ where: { status: "OPEN", code: { in: ["TIMELINE_CONFLICT", "TIMELINE_UNDATED", "DUPLICATE_SUSPECT"] }, entryId: { in: ids } }, select: { id: true, entryId: true, code: true, detail: true } }),
    prisma.changeLog.groupBy({ by: ["batchId"], where: { batchId: { startsWith: `franchise-${key}-` } }, _max: { at: true }, _count: { _all: true }, orderBy: { _max: { at: "desc" } }, take: 10 }),
  ]);
  return { works, issues, batches: batches.map((b) => ({ batchId: b.batchId as string, at: b._max.at, changes: b._count._all })) };
}

export type OrderItem = { id: string; timelineOrder: number; timelineRole: TimelineRole; timelineSeason: number | null };
type Result = { ok: true; changed: number; batchId: string | null } | { ok: false; status: number; error: string };

/** Salva a ordem: posições únicas a partir de 1, papel válido, temporada só para principal. Protege o que mudou. */
export async function saveFranchiseOrder(key: number, items: OrderItem[], reason: string | null, actor: ChangeActor): Promise<Result> {
  const works = await prisma.catalogEntry.findMany({ where: { franchiseKey: key }, select: { id: true, timelineOrder: true, timelineRole: true, timelineSeason: true, manualFields: true } });
  const byId = new Map(works.map((w) => [w.id, w]));
  if (items.length === 0 || items.some((i) => !byId.has(i.id))) return { ok: false, status: 400, error: "Lista inválida: só obras desta franquia." };
  const orders = items.map((i) => i.timelineOrder);
  if (orders.some((o) => !Number.isInteger(o) || o < 1) || new Set(orders).size !== orders.length) return { ok: false, status: 400, error: "As posições precisam ser números inteiros a partir de 1, sem repetir." };
  if (items.some((i) => !(i.timelineRole in TIMELINE_ROLES))) return { ok: false, status: 400, error: "Papel inválido." };
  if (items.some((i) => i.timelineSeason !== null && (!Number.isInteger(i.timelineSeason) || i.timelineSeason < 1 || i.timelineRole !== "MAIN"))) return { ok: false, status: 400, error: "Temporada só para obra principal, número a partir de 1." };
  const seasons = items.filter((i) => i.timelineRole === "MAIN" && i.timelineSeason !== null).map((i) => i.timelineSeason);
  if (new Set(seasons).size !== seasons.length) return { ok: false, status: 400, error: "Duas obras principais com a mesma temporada." };

  const batchId = `franchise-${key}-${Date.now()}`;
  let changed = 0;
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const before = byId.get(item.id)!;
      const changes = TIMELINE_FIELDS.filter((f) => before[f] !== item[f]).map((f) => ({ field: f, before: before[f], after: item[f] }));
      if (changes.length === 0) continue;
      const manualFields = [...new Set([...before.manualFields, ...changes.map((c) => c.field)])].sort();
      await tx.catalogEntry.update({ where: { id: item.id }, data: { timelineOrder: item.timelineOrder, timelineRole: item.timelineRole, timelineSeason: item.timelineSeason, manualFields, timelineAt: new Date() } });
      await recordChanges(tx, { origin: "ADMIN", actor, entity: "CatalogEntry", entityId: item.id, catalogEntryId: item.id, changes: [...changes, { field: "manualFields", before: before.manualFields, after: manualFields }], reason: reason || "Ordem da franquia definida pelo admin", batchId });
      changed += 1;
    }
  });
  return { ok: true, changed, batchId: changed ? batchId : null };
}

/** Desfaz um salvamento: volta os valores de antes (inclusive a proteção) das obras do lote. */
export async function undoFranchiseBatch(key: number, batchId: string, actor: ChangeActor): Promise<Result> {
  if (!batchId.startsWith(`franchise-${key}-`)) return { ok: false, status: 400, error: "Lote de outra franquia." };
  const rows = await prisma.changeLog.findMany({ where: { batchId }, orderBy: { at: "asc" } });
  if (rows.length === 0) return { ok: false, status: 404, error: "Lote não encontrado." };
  const parse = (v: string | null) => (v === null ? null : JSON.parse(v));
  const byEntry = new Map<string, Record<string, unknown>>();
  for (const r of rows) byEntry.set(r.entityId, { ...(byEntry.get(r.entityId) ?? {}), [r.field]: parse(r.before) });
  const undoId = `franchise-${key}-${Date.now()}-desfazer`;
  await prisma.$transaction(async (tx) => {
    for (const [id, before] of byEntry) {
      const current = await tx.catalogEntry.findUnique({ where: { id }, select: { timelineOrder: true, timelineRole: true, timelineSeason: true, manualFields: true } });
      if (!current) continue;
      await tx.catalogEntry.update({ where: { id }, data: before as Record<string, never> });
      await recordChanges(tx, { origin: "ADMIN", actor, entity: "CatalogEntry", entityId: id, catalogEntryId: id, changes: Object.entries(before).map(([field, value]) => ({ field, before: (current as Record<string, unknown>)[field], after: value })), reason: `Desfeito o lote ${batchId}`, batchId: undoId });
    }
  });
  return { ok: true, changed: byEntry.size, batchId: undoId };
}
