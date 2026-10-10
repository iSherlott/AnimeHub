import { prisma } from "@/lib/prisma";
import { jobCounts } from "@/lib/adminImport/pipeline";
import { STAGE_LABEL, type JobStage, type JobState, type JobStepsInput } from "@/lib/adminImport/jobSteps";

/** Entrada do `deriveSteps`/`jobGuard` a partir de um job e de seus contadores. */
export async function stepsInputFor(job: { seq: number; state: string; stage: string; total: number; error: string | null }): Promise<JobStepsInput & { counts: Awaited<ReturnType<typeof jobCounts>> }> {
  const counts = await jobCounts(job.seq);
  return {
    state: job.state as JobState,
    stage: job.stage as JobStage,
    total: counts.total || job.total,
    resolved: counts.resolved,
    pending: counts.blocking,
    error: job.error,
    counts,
  };
}

export function stageText(stage: string): string {
  return STAGE_LABEL[stage as JobStage] ?? stage;
}

/** Desde quando listar ("hoje" = últimas 24 h; sem precisar do fuso, é uma janela relativa). */
export function sinceFor(period: string | undefined): Date | null {
  const day = 24 * 3600 * 1000;
  if (period === "hoje") return new Date(Date.now() - day);
  if (period === "7d") return new Date(Date.now() - 7 * day);
  if (period === "30d") return new Date(Date.now() - 30 * day);
  return null;
}

export const PERIOD_OPTIONS = [
  { value: "", label: "Todo o período" },
  { value: "hoje", label: "Últimas 24 h" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
];

export async function sourceOptions(): Promise<string[]> {
  const rows = await prisma.adminLog.findMany({ where: { source: { not: null } }, distinct: ["source"], select: { source: true }, take: 20 });
  return rows.map((r) => r.source as string).sort();
}
