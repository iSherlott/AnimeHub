import { prisma } from "@/lib/prisma";
import { markCancelled, startExclusiveJob } from "@/lib/jobLock";
import { AUDIT_CODES, type IssueCode } from "./issues";
import { classifyKind } from "./kind";
import { checkTitles } from "./titleCheck";
import { excludedEdges } from "@/lib/story/versions";
import { placeFranchises, type OrderNode } from "./franchiseOrder";
import { findDuplicates, countDuplicateGroups, type DuplicateInput } from "./duplicates";

/**
 * Auditoria das linhas do tempo (Epic 45): percorre as obras da plataforma uma a uma e (1) confere e corrige o formato dos
 * nomes, (2) monta a linha do tempo cronológica de cada franquia, franquia por franquia — séries, OVA, ODA, filmes — e
 * (3) procura obras repetidas. O que a auditoria não resolve sozinha vira pendência (`CurationIssue`, ver AUDIT_CODES).
 * Não depende de serviço externo e pode ser refeita quantas vezes quiser: o resultado é sempre o do catálogo naquele momento.
 */
const STALE_AFTER_MS = 10 * 60 * 1000;
const WRITE_CHUNK = 200;
const SAVE_EVERY_MS = 1000;

export type TimelinePhase = "names" | "timeline" | "duplicates" | "issues" | "done";

export type TimelineProgress = {
  /** Parou a pedido (Fase 8). */
  cancelled?: boolean;
  phase: TimelinePhase;
  /** Obras da plataforma. */
  entries: number;
  franchises: number;
  franchisesDone: number;
  namesChecked: number;
  /** Nomes corrigidos (espaços, entidades HTML…). */
  namesFixed: number;
  /** Nomes que ficaram para uma pessoa conferir. */
  namesInvalid: number;
  /** Obras com posição na linha do tempo. */
  placed: number;
  main: number;
  related: number;
  specials: number;
  undated: number;
  conflicts: number;
  duplicateEntries: number;
  duplicateGroups: number;
  startedAt: string;
  updatedAt: string;
  finished: boolean;
  currentTitle: string | null;
};

type IssueDraft = { title: string; anilistId: number | null; anidbId: number | null; detail: string };

function parseRelations(json: string | null): Array<{ id: number; relationType: string }> {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as Array<{ id?: unknown; relationType?: unknown }>;
    return raw.filter((r): r is { id: number; relationType: string } => typeof r.id === "number" && typeof r.relationType === "string").map((r) => ({ id: r.id, relationType: r.relationType }));
  } catch {
    return [];
  }
}

async function inChunks<T>(items: T[], run: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let start = 0; start < items.length; start += WRITE_CHUNK) await run(items.slice(start, start + WRITE_CHUNK));
}

/** Grava as pendências de um motivo: fecha as que não valem mais e abre/atualiza as atuais. */
async function syncAuditIssues(code: IssueCode, desired: Map<string, IssueDraft>): Promise<void> {
  // O que o admin já decidiu ("não é a mesma obra") não volta a ser apontado.
  const dismissed = await prisma.curationIssue.findMany({ where: { code, status: "DISMISSED" }, select: { entryId: true } });
  for (const { entryId } of dismissed) desired.delete(entryId);
  const open = await prisma.curationIssue.findMany({ where: { code, status: "OPEN" }, select: { entryId: true } });
  const stale = open.map((o) => o.entryId).filter((id) => !desired.has(id));
  const now = new Date();
  await inChunks(stale, (chunk) => prisma.curationIssue.updateMany({ where: { code, status: "OPEN", entryId: { in: chunk } }, data: { status: "RESOLVED", resolvedAt: now } }));
  // Fase 7: o que estava resolvido e voltou reabre contando a recorrência.
  const resolved = new Set((await prisma.curationIssue.findMany({ where: { code, status: "RESOLVED", entryId: { in: [...desired.keys()] } }, select: { entryId: true } })).map((r) => r.entryId));
  await inChunks([...desired.entries()], (chunk) =>
    prisma.$transaction(
      chunk.map(([entryId, draft]) =>
        prisma.curationIssue.upsert({
          where: { entryId_code: { entryId, code } },
          create: { entryId, code, ...draft },
          update: { ...draft, status: "OPEN", ...(resolved.has(entryId) ? { resolvedAt: null, reopenCount: { increment: 1 } } : {}) },
        })
      )
    )
  );
}

export async function runTimelineAudit(seq: number, { onBatch }: { onBatch?: (p: TimelineProgress) => void } = {}): Promise<TimelineProgress> {
  const entries = await prisma.catalogEntry.findMany({
    where: { onPlatform: true },
    select: {
      id: true, anilistId: true, anidbId: true, titleRomaji: true, titleEnglish: true, titleNative: true, kind: true, format: true,
      season: true, seasonYear: true, startDate: true, relationsJson: true, franchiseKey: true, timelineOrder: true, timelineRole: true, timelineSeason: true, manualFields: true,
    },
    orderBy: { id: "asc" },
  });
  const progress: TimelineProgress = {
    phase: "names", entries: entries.length, franchises: 0, franchisesDone: 0, namesChecked: 0, namesFixed: 0, namesInvalid: 0, placed: 0, main: 0, related: 0, specials: 0,
    undated: 0, conflicts: 0, duplicateEntries: 0, duplicateGroups: 0, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finished: false, currentTitle: null,
  };
  let lastSave = 0;
  let cancelRequested = false;
  const save = async (note: string, processed: number, total: number, force = false) => {
    if (!force && Date.now() - lastSave < SAVE_EVERY_MS) return;
    lastSave = Date.now();
    progress.updatedAt = new Date().toISOString();
    // Sinal de vida e pedido de cancelamento (Fase 8).
    const job = await prisma.adminJob.update({ where: { seq }, data: { processed, total, progressNote: note, resultJson: JSON.stringify(progress), heartbeatAt: new Date() }, select: { cancelRequestedAt: true } }).catch(() => null);
    cancelRequested = Boolean(job?.cancelRequestedAt);
    onBatch?.(progress);
  };
  await save(`Conferindo ${entries.length} obras…`, 0, entries.length, true);

  // 1. Nomes: corrige o formato e separa o que precisa de uma pessoa.
  const nameIssues = new Map<string, IssueDraft>();
  const nameFixes: Array<{ id: string; data: Record<string, string | null> }> = [];
  for (const entry of entries) {
    const check = checkTitles(entry);
    if (Object.keys(check.fixed).length > 0) {
      nameFixes.push({ id: entry.id, data: check.fixed });
      progress.namesFixed += 1;
    }
    if (check.problems.length > 0) {
      nameIssues.set(entry.id, { title: entry.titleRomaji, anilistId: entry.anilistId, anidbId: entry.anidbId, detail: check.problems.join("; ") });
      progress.namesInvalid += 1;
    }
    progress.namesChecked += 1;
    progress.currentTitle = entry.titleRomaji;
    await save(`Passo 1 de 4 — conferindo os nomes: ${progress.namesChecked} de ${entries.length}`, progress.namesChecked, entries.length);
  }
  await inChunks(nameFixes, (chunk) => prisma.$transaction(chunk.map((fix) => prisma.catalogEntry.update({ where: { id: fix.id }, data: fix.data }))));

  // 2. Linha do tempo: franquia por franquia, tudo em ordem cronológica.
  const byAnilist = new Map(entries.filter((e) => e.anilistId !== null).map((e) => [e.anilistId as number, e]));
  const nodes: OrderNode[] = entries
    .filter((e) => e.anilistId !== null)
    .map((e) => ({
      anilistId: e.anilistId as number,
      kind: e.kind ?? classifyKind({ format: e.format, title: e.titleRomaji }),
      startDate: e.startDate ? e.startDate.getTime() : null,
      season: e.season,
      seasonYear: e.seasonYear,
      relations: parseRelations(e.relationsJson),
    }));
  // Cada versão de uma história refeita (reboot) tem a própria franquia e a própria linha do tempo.
  const franchises = placeFranchises(nodes, excludedEdges(await prisma.storyLink.findMany({ select: { oldAnilistId: true, newAnilistId: true } })));
  progress.phase = "timeline";
  progress.franchises = franchises.length;
  const undatedIssues = new Map<string, IssueDraft>();
  const conflictIssues = new Map<string, IssueDraft>();
  const now = new Date();
  for (const franchise of franchises) {
    if (cancelRequested) {
      progress.cancelled = true;
      return progress;
    }
    const writes = [];
    for (const place of franchise.members) {
      const entry = byAnilist.get(place.anilistId) as (typeof entries)[number];
      progress.placed += 1;
      if (place.role === "MAIN") progress.main += 1;
      else if (place.role === "RELATED") progress.related += 1;
      else progress.specials += 1;
      if (place.undated) {
        progress.undated += 1;
        undatedIssues.set(entry.id, { title: entry.titleRomaji, anilistId: entry.anilistId, anidbId: entry.anidbId, detail: "sem data de estreia nem temporada" });
      }
      if (place.conflict) {
        progress.conflicts += 1;
        conflictIssues.set(entry.id, { title: entry.titleRomaji, anilistId: entry.anilistId, anidbId: entry.anidbId, detail: place.conflict });
      }
      // Ordem, papel e temporada definidos pelo admin (Fase 7) não mudam: a auditoria só preenche o que não é manual.
      const manual = new Set(entry.manualFields);
      const computed = { franchiseKey: place.franchiseKey, timelineOrder: place.order, timelineRole: place.role, timelineSeason: place.season };
      const data = Object.fromEntries(Object.entries(computed).filter(([field, value]) => !manual.has(field) && (entry as Record<string, unknown>)[field] !== value));
      if (Object.keys(data).length) {
        writes.push(prisma.catalogEntry.update({ where: { id: entry.id }, data: { ...data, timelineAt: now } }));
      }
    }
    if (writes.length) await inChunks(writes, (chunk) => prisma.$transaction(chunk));
    progress.franchisesDone += 1;
    progress.currentTitle = (byAnilist.get(franchise.key)?.titleRomaji) ?? progress.currentTitle;
    await save(`Passo 2 de 4 — linha do tempo, franquia ${progress.franchisesDone} de ${franchises.length} (${franchise.members.length} obras)`, progress.franchisesDone, franchises.length);
  }

  // 3. Obras repetidas.
  progress.phase = "duplicates";
  await save("Passo 3 de 4 — procurando obras repetidas…", franchises.length, franchises.length, true);
  const inputs: DuplicateInput[] = entries.map((e) => {
    const start = e.startDate ? e.startDate.getUTCFullYear() : null;
    return {
      id: e.id, anilistId: e.anilistId, anidbId: e.anidbId, titleRomaji: e.titleRomaji, titleEnglish: e.titleEnglish, titleNative: e.titleNative,
      kind: e.kind ?? classifyKind({ format: e.format, title: e.titleRomaji }), year: start ?? e.seasonYear,
      related: new Set(parseRelations(e.relationsJson).map((r) => r.id)),
    };
  });
  const matches = findDuplicates(inputs);
  const dupIssues = new Map<string, IssueDraft>();
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const [id, list] of matches) {
    const entry = byId.get(id) as (typeof entries)[number];
    dupIssues.set(id, { title: entry.titleRomaji, anilistId: entry.anilistId, anidbId: entry.anidbId, detail: list.slice(0, 3).map((m) => m.reason).join("; ") + (list.length > 3 ? `; e mais ${list.length - 3}` : "") });
  }
  progress.duplicateEntries = matches.size;
  progress.duplicateGroups = countDuplicateGroups(matches);

  // 4. Pendências.
  progress.phase = "issues";
  await save("Passo 4 de 4 — gravando as pendências…", franchises.length, franchises.length, true);
  await syncAuditIssues("NAME_INVALID", nameIssues);
  await syncAuditIssues("DUPLICATE_SUSPECT", dupIssues);
  await syncAuditIssues("TIMELINE_UNDATED", undatedIssues);
  await syncAuditIssues("TIMELINE_CONFLICT", conflictIssues);

  progress.phase = "done";
  progress.finished = true;
  progress.currentTitle = null;
  return progress;
}

export async function createTimelineJob(actor: { id: string; name: string }): Promise<{ seq: number } | { running: number }> {
  // Um por vez, de forma atômica (Fase 8, `jobLock`).
  const started = await startExclusiveJob("TIMELINE", { source: "Catálogo", season: "Linhas do tempo e nomes", stage: "COMMIT", progressNote: "Iniciando…", adminId: actor.id, adminName: actor.name }, STALE_AFTER_MS);
  return started.ok ? { seq: started.job.seq } : { running: started.running.seq };
}

/** Roda a auditoria como job auditável (SUCCESS com o resumo, ou FAILED com o motivo). */
export async function auditTimelines({ actor, onBatch }: { actor: { id: string; name: string }; onBatch?: (p: TimelineProgress) => void }): Promise<TimelineProgress | { running: number }> {
  const created = await createTimelineJob(actor);
  if ("running" in created) return created;
  try {
    const progress = await runTimelineAudit(created.seq, { onBatch });
    if (progress.cancelled) {
      await markCancelled(created.seq, `Cancelado a pedido depois de ${progress.franchisesDone} franquia(s); as já auditadas ficam.`);
      return progress;
    }
    await prisma.adminJob.update({
      where: { seq: created.seq },
      data: { state: "SUCCESS", stage: "NOTIFICATION", progressNote: null, processed: progress.franchises, total: progress.franchises, finishedAt: new Date(), resultJson: JSON.stringify(progress) },
    });
    return progress;
  } catch (error) {
    await prisma.adminJob
      .update({ where: { seq: created.seq }, data: { state: "FAILED", progressNote: null, finishedAt: new Date(), error: error instanceof Error ? error.message.slice(0, 300) : "Falha inesperada." } })
      .catch(() => undefined);
    throw error;
  }
}

export type TimelineStatus = {
  job: { seq: number; state: string; error: string | null; finishedAt: string | null; progressNote: string | null } | null;
  progress: TimelineProgress | null;
  /** Obras da plataforma, quantas já têm posição na linha do tempo e quantas franquias existem. */
  entries: number;
  placed: number;
  franchises: number;
  openIssues: Record<string, number>;
};

export async function getTimelineStatus(): Promise<TimelineStatus> {
  const [job, entries, placed, franchises, issues] = await Promise.all([
    prisma.adminJob.findFirst({ where: { kind: "TIMELINE" }, orderBy: { seq: "desc" } }),
    prisma.catalogEntry.count({ where: { onPlatform: true } }),
    prisma.catalogEntry.count({ where: { onPlatform: true, timelineOrder: { not: null } } }),
    prisma.catalogEntry.groupBy({ by: ["franchiseKey"], where: { onPlatform: true, franchiseKey: { not: null } } }).then((rows) => rows.length),
    prisma.curationIssue.groupBy({ by: ["code"], where: { status: "OPEN", code: { in: [...AUDIT_CODES] } }, _count: { _all: true } }),
  ]);
  let progress: TimelineProgress | null = null;
  try {
    progress = job?.resultJson ? (JSON.parse(job.resultJson) as TimelineProgress) : null;
  } catch {
    progress = null;
  }
  return {
    job: job ? { seq: job.seq, state: job.state, error: job.error, finishedAt: job.finishedAt?.toISOString() ?? null, progressNote: job.progressNote } : null,
    progress,
    entries,
    placed,
    franchises,
    openIssues: Object.fromEntries(AUDIT_CODES.map((code) => [code, issues.find((i) => i.code === code)?._count._all ?? 0])),
  };
}
