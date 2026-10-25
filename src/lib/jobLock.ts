import type { AdminJob, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Prevenção de concorrência dos jobs (Fase 8, §15). Iniciar um job exclusivo acontece numa transação com trava do
 * Postgres (`pg_advisory_xact_lock` pelo tipo do job): dois pedidos simultâneos são serializados, e o segundo encontra o
 * primeiro rodando. Um job rodando sem sinal de vida (`heartbeatAt`) há mais que `staleAfterMs` é dado como interrompido
 * e marcado como falha antes de começar outro. Os jobs atualizam o sinal de vida a cada passo (`heartbeat`).
 *
 * Política por tipo (documentada em docs/arquitetura/jobs.md):
 *  - CURATION, TIMELINE, TRANSLATION, ANILIST, ANIDB_EPISODES: um por vez; retomáveis (rodar de novo continua de onde parou).
 *  - IMPORT: vários ao mesmo tempo (cada lote espera revisão humana); o commit é que é único por lote.
 *  - FIELD_UPDATE: vários em revisão; a execução trava o próprio lote (etapa APPLY).
 */
export const EXCLUSIVE_KINDS = ["CURATION", "TIMELINE", "TRANSLATION", "ANILIST", "ANIDB_EPISODES"] as const;
export type ExclusiveKind = (typeof EXCLUSIVE_KINDS)[number];
export const DEFAULT_STALE_MS = 10 * 60_000;

export class JobBusyError extends Error {
  constructor(readonly running: AdminJob) {
    super(`Já há um job deste tipo em execução (#${running.seq}).`);
  }
}

/** Último sinal de vida: o heartbeat, ou o início. */
export function lastSignal(job: Pick<AdminJob, "heartbeatAt" | "createdAt">): Date {
  return job.heartbeatAt ?? job.createdAt;
}

export async function startExclusiveJob(kind: ExclusiveKind, data: Omit<Prisma.AdminJobUncheckedCreateInput, "kind" | "state">, staleAfterMs: number = DEFAULT_STALE_MS): Promise<{ ok: true; job: AdminJob } | { ok: false; running: AdminJob }> {
  return prisma.$transaction(async (tx) => {
    // A função devolve void, que o Prisma não lê: a consulta devolve 1 depois de obter a trava.
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`adminjob:${kind}`}))) AS l`;
    const running = await tx.adminJob.findFirst({ where: { kind, state: "RUNNING" }, orderBy: { seq: "desc" } });
    const now = new Date();
    if (running) {
      if (now.getTime() - lastSignal(running).getTime() < staleAfterMs) return { ok: false as const, running };
      await tx.adminJob.update({ where: { seq: running.seq }, data: { state: "FAILED", error: "Interrompido (sem sinal de vida).", finishedAt: now } });
      await tx.adminLog.create({ data: { jobSeq: running.seq, source: running.source, level: "WARN", event: "Job stale", message: `Job #${running.seq} sem sinal de vida desde ${lastSignal(running).toISOString()}: marcado como interrompido.`, context: kind } });
    }
    const job = await tx.adminJob.create({ data: { ...data, kind, state: "RUNNING", heartbeatAt: now } });
    return { ok: true as const, job };
  });
}

/** Sinal de vida do job (chamar a cada passo). Devolve se foi pedido o cancelamento. */
export async function heartbeat(seq: number): Promise<{ cancelRequested: boolean }> {
  const job = await prisma.adminJob.update({ where: { seq }, data: { heartbeatAt: new Date() }, select: { cancelRequestedAt: true } }).catch(() => null);
  return { cancelRequested: Boolean(job?.cancelRequestedAt) };
}

/** Pedido de cancelamento (cooperativo): o job para no próximo passo, sem desfazer o que já gravou. */
export async function requestCancel(seq: number, actorName: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const job = await prisma.adminJob.findUnique({ where: { seq } });
  if (!job) return { ok: false, status: 404, error: "Job não encontrado." };
  if (job.state !== "RUNNING") return { ok: false, status: 409, error: "Só um job em execução pode ser cancelado." };
  if (!(EXCLUSIVE_KINDS as readonly string[]).includes(job.kind)) return { ok: false, status: 400, error: "Este tipo de job não tem cancelamento seguro aqui (importação: use Cancelar na revisão do lote)." };
  await prisma.adminJob.update({ where: { seq }, data: { cancelRequestedAt: new Date() } });
  await prisma.adminLog.create({ data: { jobSeq: seq, source: job.source, level: "WARN", event: "Cancel requested", message: `Cancelamento pedido por ${actorName}: o job para no próximo passo; o que já foi gravado fica.`, context: job.kind, adminName: actorName } });
  return { ok: true };
}

/** Fecha um job que parou a pedido. */
export async function markCancelled(seq: number, note: string): Promise<void> {
  await prisma.adminJob.update({ where: { seq }, data: { state: "CANCELLED", finishedAt: new Date(), progressNote: null, error: note } }).catch(() => undefined);
}

/** Há um job deste tipo vivo agora (rodando e com sinal de vida recente)? Usado para responder 409 antes de iniciar. */
export async function aliveExclusiveJob(kind: ExclusiveKind, staleAfterMs: number = DEFAULT_STALE_MS): Promise<AdminJob | null> {
  const running = await prisma.adminJob.findFirst({ where: { kind, state: "RUNNING" }, orderBy: { seq: "desc" } });
  return running && Date.now() - lastSignal(running).getTime() < staleAfterMs ? running : null;
}
