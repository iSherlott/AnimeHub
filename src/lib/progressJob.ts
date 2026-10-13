import { prisma } from "@/lib/prisma";

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
  const job = await prisma.adminJob.create({
    data: { kind: options.kind, source: options.source, season: options.label, state: "RUNNING", stage: options.stage, progressNote: "Iniciando…", adminId: options.actor.id, adminName: options.actor.name },
  });
  const report: ProgressReport = async (note, done, total) => {
    await prisma.adminJob
      .update({ where: { seq: job.seq }, data: { progressNote: note, ...(done !== undefined ? { processed: done } : {}), ...(total !== undefined ? { total } : {}) } })
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
