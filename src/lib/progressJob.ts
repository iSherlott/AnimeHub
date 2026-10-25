import { prisma } from "@/lib/prisma";
import { EXCLUSIVE_KINDS, JobBusyError, startExclusiveJob, type ExclusiveKind } from "@/lib/jobLock";

/** Atualiza o passo em andamento: frase, e (quando se sabe) quantos já foram de quantos. */
export type ProgressReport = (note: string, done?: number, total?: number) => Promise<void>;

export const noProgress: ProgressReport = async () => undefined;

/**
 * Roda uma operação do painel (ex.: importação da AniList) como um job auditável com andamento. A tela consulta
 * `/api/admin/imports/progress?kind=ANILIST&since=…` enquanto a chamada não volta. O job termina em SUCCESS (com o
 * resultado) ou FAILED (com o motivo); o erro original continua sendo lançado.
 */
export async function withProgressJob<T>(
  options: { kind: string; source: string; label: string; stage: "NORMALIZE" | "COMMIT"; actor: { id: string; name: string }; summarize?: (result: T) => unknown },
  work: (report: ProgressReport) => Promise<T>
): Promise<T> {
  const data = { source: options.source, season: options.label, stage: options.stage, progressNote: "Iniciando…", adminId: options.actor.id, adminName: options.actor.name };
  // Fase 8: o que grava (etapa COMMIT) de um tipo exclusivo roda um por vez, de forma atômica; consultas (NORMALIZE) não travam.
  let job;
  if (options.stage === "COMMIT" && (EXCLUSIVE_KINDS as readonly string[]).includes(options.kind)) {
    const started = await startExclusiveJob(options.kind as ExclusiveKind, data);
    if (!started.ok) throw new JobBusyError(started.running);
    job = started.job;
  } else {
    job = await prisma.adminJob.create({ data: { ...data, kind: options.kind, state: "RUNNING", heartbeatAt: new Date() } });
  }
  const report: ProgressReport = async (note, done, total) => {
    await prisma.adminJob
      .update({ where: { seq: job.seq }, data: { progressNote: note, heartbeatAt: new Date(), ...(done !== undefined ? { processed: done } : {}), ...(total !== undefined ? { total } : {}) } })
      .catch(() => undefined);
  };
  try {
    const result = await work(report);
    await prisma.adminJob
      .update({ where: { seq: job.seq }, data: { state: "SUCCESS", stage: "NOTIFICATION", progressNote: null, finishedAt: new Date(), resultJson: JSON.stringify(options.summarize ? options.summarize(result) : result) } })
      .catch(() => undefined);
    return result;
  } catch (error) {
    await prisma.adminJob
      .update({ where: { seq: job.seq }, data: { state: "FAILED", progressNote: null, finishedAt: new Date(), error: error instanceof Error ? error.message.slice(0, 300) : "Falha inesperada." } })
      .catch(() => undefined);
    throw error;
  }
}
