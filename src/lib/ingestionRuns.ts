import { prisma } from "@/lib/prisma";

export type IngestionStatus = "OK" | "PARTIAL" | "ERROR";

/** Execuções mais antigas que isto saem (o Admin mostra o recente, não o histórico completo). */
const RETENTION_MS = 14 * 24 * 3600 * 1000;

/** "OK" sem falhas; "PARTIAL" quando parte entrou e parte falhou; "ERROR" quando nada entrou. */
export function ingestionStatus(processed: number, failed: number): IngestionStatus {
  if (failed === 0) return "OK";
  return processed > 0 ? "PARTIAL" : "ERROR";
}

/**
 * Registra uma execução de serviço de ingestão/jobs (Admin → Execuções,
 * ADMIN-003/004). Nunca lança: registrar não pode derrubar o job registrado.
 */
export async function recordIngestionRun(input: {
  source: string;
  startedAt: Date;
  processed: number;
  failed: number;
  message?: string | null;
}): Promise<void> {
  try {
    await prisma.ingestionRun.create({
      data: {
        source: input.source,
        startedAt: input.startedAt,
        finishedAt: new Date(),
        status: ingestionStatus(input.processed, input.failed),
        itemsProcessed: input.processed,
        itemsFailed: input.failed,
        message: input.message ? input.message.slice(0, 500) : null,
      },
    });
    await prisma.ingestionRun.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - RETENTION_MS) } } });
  } catch (error) {
    console.error("[ingestionRuns] falhou ao registrar:", error);
  }
}
