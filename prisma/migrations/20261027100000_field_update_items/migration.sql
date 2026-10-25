-- Fase 6 (Cenário F): preparação da atualização seletiva de campos — o que a fonte devolveu por obra, antes de aplicar.
-- Só acrescenta uma tabela.

-- CreateTable
CREATE TABLE "FieldUpdateItem" (
    "id" TEXT NOT NULL,
    "jobSeq" INTEGER NOT NULL,
    "catalogEntryId" TEXT NOT NULL,
    "anilistId" INTEGER,
    "title" TEXT NOT NULL,
    "diffJson" TEXT,
    "selectedJson" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "collectedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "FieldUpdateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldUpdateItem_jobSeq_state_idx" ON "FieldUpdateItem"("jobSeq", "state");

-- AddForeignKey
ALTER TABLE "FieldUpdateItem" ADD CONSTRAINT "FieldUpdateItem_jobSeq_fkey" FOREIGN KEY ("jobSeq") REFERENCES "AdminJob"("seq") ON DELETE CASCADE ON UPDATE CASCADE;

