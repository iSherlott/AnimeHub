/**
 * Etapas de um job de importação (Figma "Job Detail", `8:4919`). O estado de
 * cada etapa é DERIVADO do job — Commit nunca aparece concluído antes da
 * revisão, e Broadcast/Notification só existem depois de um commit autorizado.
 */
export type JobState = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
export type JobStage = "PARSE" | "NORMALIZE" | "MATCHING" | "COMMIT" | "BROADCAST" | "NOTIFICATION";

export const STAGES: JobStage[] = ["PARSE", "NORMALIZE", "MATCHING", "COMMIT", "BROADCAST", "NOTIFICATION"];

export const STAGE_LABEL: Record<JobStage, string> = {
  PARSE: "Parse",
  NORMALIZE: "Normalize",
  MATCHING: "Matching",
  COMMIT: "Commit",
  BROADCAST: "Broadcast",
  NOTIFICATION: "Notification",
};

export const STATE_LABEL: Record<JobState, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  SUCCESS: "Success",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export type StepView = { stage: JobStage; state: JobState; detail: string };

export type JobStepsInput = {
  state: JobState;
  stage: JobStage;
  total: number;
  /** Registros já decididos (aceitos, novos, confirmados ou ignorados). */
  resolved: number;
  pending: number;
  error?: string | null;
  alertsPrepared?: number;
};

export function deriveSteps(job: JobStepsInput): StepView[] {
  const current = STAGES.indexOf(job.stage);
  const details: Record<JobStage, string> = {
    PARSE: `${job.total} registros extraídos do HTML`,
    NORMALIZE: "Títulos, tipos e origem preservados",
    MATCHING: job.pending > 0 ? `${job.resolved}/${job.total} · correspondências em análise` : `${job.total}/${job.total} · correspondências concluídas`,
    COMMIT: "Bloqueado até prévia revisada e confirmação",
    BROADCAST: "Depende de commit autorizado",
    NOTIFICATION: "Somente depois do broadcast consolidado",
  };

  return STAGES.map((stage, index) => {
    let state: JobState;
    let detail = details[stage];
    if (job.state === "SUCCESS") {
      state = "SUCCESS";
      if (stage === "COMMIT") detail = "Aplicado após confirmação explícita";
      if (stage === "BROADCAST") detail = "Catálogo atualizado";
      if (stage === "NOTIFICATION") detail = `${job.alertsPrepared ?? 0} alertas de data alterada preparados`;
    } else if (job.state === "FAILED") {
      state = index < current ? "SUCCESS" : index === current ? "FAILED" : "PENDING";
      if (index === current) detail = job.error ?? "Falha na etapa";
    } else if (job.state === "CANCELLED") {
      state = index <= Math.min(current, STAGES.indexOf("MATCHING")) ? "SUCCESS" : "CANCELLED";
      if (state === "CANCELLED") detail = "Cancelado antes do commit";
    } else if (job.state === "PENDING") {
      state = "PENDING";
    } else if (stage === "MATCHING" && job.pending > 0) {
      // Em execução: matching aguarda revisão humana.
      state = "RUNNING";
    } else if (index < STAGES.indexOf("COMMIT") && (job.pending === 0 || index < STAGES.indexOf("MATCHING"))) {
      state = "SUCCESS";
    } else if (stage === "COMMIT" && job.pending === 0) {
      state = "PENDING";
      detail = "Aguardando confirmação explícita";
    } else {
      state = "PENDING";
    }
    return { stage, state, detail };
  });
}

/** Texto curto de progresso/guarda para a tabela de jobs. */
export function jobGuard(job: JobStepsInput & { kind?: string }): string {
  if (job.state === "FAILED") return job.error ?? "Falha";
  if (job.state === "CANCELLED") return "Cancelado por admin";
  if (job.state === "SUCCESS") return "Lote concluído";
  if (job.state === "PENDING") return "Depende de commit confirmado";
  return job.pending > 0 ? `${job.resolved}/${job.total} · commit bloqueado` : `${job.resolved}/${job.total} · aguardando confirmação`;
}
