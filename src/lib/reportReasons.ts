/**
 * Motivos fixos de denúncia (Figma `13:43571`, D-16): privados, sem dados
 * pessoais; o autor nunca vê quem denunciou e denunciar NÃO bloqueia o
 * perfil automaticamente.
 */
export const REPORT_REASONS = ["SPAM", "HARASSMENT", "UNMARKED_SPOILER", "OTHER"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: "Spam ou conteúdo repetitivo",
  HARASSMENT: "Assédio ou discurso de ódio",
  UNMARKED_SPOILER: "Spoiler sem aviso",
  OTHER: "Outro motivo",
};

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value);
}

export type ReportTargetKind = "post" | "comment" | "profile";
