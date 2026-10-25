import type { CatalogEntry, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordChanges, type ChangeActor } from "@/lib/changeLog";
import { ISSUE_CODES, ISSUE_LABELS, type IssueCode } from "@/lib/curation/issues";
import { codesWithPriority, PRIORITIES, priorityOf, type Priority } from "@/lib/curation/priority";

/**
 * Fila de pendências de curadoria (Fase 7, §14): filtros por tipo, prioridade, fonte, data e estado; resolver quando a
 * condição foi atendida; ignorar com justificativa; reabrir; indicadores. Ignorar não apaga: a curadoria mantém a
 * pendência ignorada enquanto a condição for a mesma e reabre se ela voltar depois de resolvida.
 */
export const QUEUE_PAGE_SIZE = 50;
export const ISSUE_STATES = { OPEN: "Aberta", RESOLVED: "Resolvida", DISMISSED: "Ignorada" } as const;
export type IssueState = keyof typeof ISSUE_STATES;

export type QueueFilters = { tipo: "" | IssueCode; prioridade: "" | Priority; fonte: "" | "anilist" | "anidb"; estado: IssueState; de: string; ate: string; q: string; pagina: number };

export function parseQueueFilters(sp: Record<string, string | undefined> | URLSearchParams): QueueFilters {
  const get = (n: string) => ((sp instanceof URLSearchParams ? sp.get(n) : sp[n]) ?? "").trim();
  const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  return {
    tipo: (ISSUE_CODES as readonly string[]).includes(get("tipo")) ? (get("tipo") as IssueCode) : "",
    prioridade: (PRIORITIES as readonly string[]).includes(get("prioridade")) ? (get("prioridade") as Priority) : "",
    fonte: get("fonte") === "anilist" || get("fonte") === "anidb" ? (get("fonte") as "anilist" | "anidb") : "",
    estado: get("estado") in ISSUE_STATES ? (get("estado") as IssueState) : "OPEN",
    de: day(get("de")),
    ate: day(get("ate")),
    q: get("q").slice(0, 80),
    pagina: Math.max(0, Math.min(10_000, Number(get("pagina")) || 0)),
  };
}

function where(f: QueueFilters): Prisma.CurationIssueWhereInput {
  const and: Prisma.CurationIssueWhereInput[] = [{ status: f.estado }];
  if (f.tipo) and.push({ code: f.tipo });
  if (f.prioridade) and.push({ code: { in: codesWithPriority(f.prioridade) } });
  if (f.fonte === "anilist") and.push({ anilistId: { not: null } });
  if (f.fonte === "anidb") and.push({ anilistId: null });
  if (f.de || f.ate) and.push({ createdAt: { ...(f.de ? { gte: new Date(`${f.de}T00:00:00Z`) } : {}), ...(f.ate ? { lt: new Date(Date.parse(`${f.ate}T00:00:00Z`) + 86_400_000) } : {}) } });
  if (f.q) and.push({ title: { contains: f.q, mode: "insensitive" } });
  return { AND: and };
}

export async function loadQueue(f: QueueFilters) {
  const w = where(f);
  const total = await prisma.curationIssue.count({ where: w });
  // Prioridade primeiro (alta → informativa), depois as mais antigas — paginando grupo a grupo no banco.
  let skip = f.pagina * QUEUE_PAGE_SIZE;
  let take = QUEUE_PAGE_SIZE;
  const page: Awaited<ReturnType<typeof prisma.curationIssue.findMany>> = [];
  for (const priority of PRIORITIES) {
    if (take <= 0) break;
    const group: Prisma.CurationIssueWhereInput = { AND: [w, { code: { in: codesWithPriority(priority) } }] };
    const count = await prisma.curationIssue.count({ where: group });
    if (skip >= count) {
      skip -= count;
      continue;
    }
    const rows = await prisma.curationIssue.findMany({ where: group, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip, take });
    page.push(...rows);
    take -= rows.length;
    skip = 0;
  }
  const rows = page.map((i) => ({
    ...i,
    priority: priorityOf(i.code),
    label: ISSUE_LABELS[i.code as IssueCode]?.title ?? i.code,
    why: ISSUE_LABELS[i.code as IssueCode]?.why ?? "",
    source: i.anilistId !== null ? "AniList" : "AniDB",
  }));
  return { rows, total, page: f.pagina, pages: Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE)) };
}

export type QueueIndicators = {
  open: number;
  critical: number;
  resolved: number;
  resolved30d: number;
  dismissed: number;
  avgResolutionHours: number | null;
  recurring: number;
  reopenRate: number | null;
  byType: Array<{ code: string; label: string; priority: Priority; open: number }>;
  bySource: { anilist: number; anidb: number };
};

export async function queueIndicators(now: Date = new Date()): Promise<QueueIndicators> {
  const [open, critical, resolved, resolved30d, dismissed, recurring, everResolved, avg, byType, anilist] = await Promise.all([
    prisma.curationIssue.count({ where: { status: "OPEN" } }),
    prisma.curationIssue.count({ where: { status: "OPEN", code: { in: codesWithPriority("alta") } } }),
    prisma.curationIssue.count({ where: { status: "RESOLVED" } }),
    prisma.curationIssue.count({ where: { status: "RESOLVED", resolvedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } }),
    prisma.curationIssue.count({ where: { status: "DISMISSED" } }),
    prisma.curationIssue.count({ where: { reopenCount: { gt: 0 } } }),
    prisma.curationIssue.count({ where: { OR: [{ resolvedAt: { not: null } }, { reopenCount: { gt: 0 } }] } }),
    // Tempo médio só das que têm a data real de resolução (depois da Fase 7) e foram resolvidas depois de criadas.
    prisma.$queryRaw<Array<{ h: number | null }>>`SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600)::float AS h FROM "CurationIssue" WHERE "status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "resolvedAt" > "createdAt" AND "resolvedAt" <> "updatedAt"`,
    prisma.curationIssue.groupBy({ by: ["code"], where: { status: "OPEN" }, _count: { _all: true } }),
    prisma.curationIssue.count({ where: { status: "OPEN", anilistId: { not: null } } }),
  ]);
  return {
    open,
    critical,
    resolved,
    resolved30d,
    dismissed,
    avgResolutionHours: avg[0]?.h ?? null,
    recurring,
    reopenRate: everResolved ? recurring / everResolved : null,
    byType: byType.map((t) => ({ code: t.code, label: ISSUE_LABELS[t.code as IssueCode]?.title ?? t.code, priority: priorityOf(t.code), open: t._count._all })).sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || b.open - a.open),
    bySource: { anilist, anidb: open - anilist },
  };
}

/** A condição da pendência ainda existe na obra? `null` = não dá para conferir sozinho (decisão humana). */
export function conditionPersists(code: string, e: Pick<CatalogEntry, "description" | "titleNative" | "titleEnglish" | "genres" | "officialSite" | "kind" | "seasonYear" | "startDate">): boolean | null {
  switch (code) {
    case "SYNOPSIS_EN_MISSING":
      return !e.description;
    case "TITLE_JA_MISSING":
      return !e.titleNative;
    case "TITLE_EN_MISSING":
      return !e.titleEnglish;
    case "NO_GENRE":
      return !e.genres;
    case "OFFICIAL_SITE_MISSING":
      return !e.officialSite;
    case "KIND_UNKNOWN":
      return !e.kind || e.kind === "UNKNOWN";
    case "TIMELINE_UNDATED":
      return !e.seasonYear && !e.startDate;
    default:
      return null;
  }
}

type Result = { ok: true } | { ok: false; status: number; error: string };

export async function resolveIssue(id: string, reason: string | null, actor: ChangeActor): Promise<Result> {
  const issue = await prisma.curationIssue.findUnique({ where: { id } });
  if (!issue) return { ok: false, status: 404, error: "Pendência não encontrada." };
  if (issue.status === "RESOLVED") return { ok: false, status: 409, error: "Já está resolvida." };
  const entry = await prisma.catalogEntry.findUnique({ where: { id: issue.entryId } });
  const persists = entry ? conditionPersists(issue.code, entry) : false;
  if (persists === true) return { ok: false, status: 409, error: "A condição ainda existe na obra: corrija a obra antes (ou ignore com justificativa)." };
  if (persists === null && (!reason || reason.trim().length < 3)) return { ok: false, status: 400, error: "Esta pendência depende de decisão: diga o motivo para marcar como resolvida." };
  await prisma.curationIssue.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date(), dismissedReason: null, dismissedBy: null } });
  await recordChanges(prisma, { origin: "ADMIN", actor, entity: "CurationIssue", entityId: id, catalogEntryId: issue.entryId, changes: [{ field: "status", before: issue.status, after: "RESOLVED" }], reason });
  return { ok: true };
}

export async function dismissIssue(id: string, reason: string, actor: ChangeActor): Promise<Result> {
  const issue = await prisma.curationIssue.findUnique({ where: { id } });
  if (!issue) return { ok: false, status: 404, error: "Pendência não encontrada." };
  if (!reason || reason.trim().length < 3) return { ok: false, status: 400, error: "Diga a justificativa para ignorar." };
  if (issue.status === "DISMISSED") return { ok: false, status: 409, error: "Já está ignorada." };
  await prisma.curationIssue.update({ where: { id }, data: { status: "DISMISSED", dismissedReason: reason.trim().slice(0, 500), dismissedBy: actor.name, resolvedAt: null } });
  await recordChanges(prisma, { origin: "ADMIN", actor, entity: "CurationIssue", entityId: id, catalogEntryId: issue.entryId, changes: [{ field: "status", before: issue.status, after: "DISMISSED" }], reason });
  return { ok: true };
}

export async function reopenIssue(id: string, actor: ChangeActor): Promise<Result> {
  const issue = await prisma.curationIssue.findUnique({ where: { id } });
  if (!issue) return { ok: false, status: 404, error: "Pendência não encontrada." };
  if (issue.status === "OPEN") return { ok: false, status: 409, error: "Já está aberta." };
  await prisma.curationIssue.update({ where: { id }, data: { status: "OPEN", resolvedAt: null, dismissedReason: null, dismissedBy: null, reopenCount: { increment: 1 } } });
  await recordChanges(prisma, { origin: "ADMIN", actor, entity: "CurationIssue", entityId: id, catalogEntryId: issue.entryId, changes: [{ field: "status", before: issue.status, after: "OPEN" }] });
  return { ok: true };
}
