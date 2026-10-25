-- Fase 8: sinal de vida e pedido de cancelamento dos jobs (trava de concorrência em src/lib/jobLock.ts). Só acrescenta.
-- Jobs em execução ganham o sinal de vida de agora (para não serem dados como interrompidos na hora).

-- AlterTable
ALTER TABLE "AdminJob" ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "heartbeatAt" TIMESTAMP(3);

UPDATE "AdminJob" SET "heartbeatAt" = CURRENT_TIMESTAMP WHERE "state" = 'RUNNING';
