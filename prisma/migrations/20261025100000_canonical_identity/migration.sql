-- Fase 2 (ADR 0008): identidade interna da obra (catalogEntryId), campos protegidos e histórico de alterações.
-- Só acrescenta: nada é apagado. Para reverter, ver docs/arquitetura/fonte-de-verdade.md ("Reverter a Fase 2").

-- AlterTable
ALTER TABLE "AiringScheduleEntry" ADD COLUMN     "catalogEntryId" TEXT;

-- AlterTable
ALTER TABLE "Anime" ADD COLUMN     "catalogEntryId" TEXT;

-- AlterTable
ALTER TABLE "CatalogEntry" ADD COLUMN     "manualFields" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Production" ADD COLUMN     "catalogEntryId" TEXT;

-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT,
    "origin" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "catalogEntryId" TEXT,
    "field" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "reason" TEXT,
    "jobSeq" INTEGER,
    "batchId" TEXT,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeLog_entity_entityId_at_idx" ON "ChangeLog"("entity", "entityId", "at");

-- CreateIndex
CREATE INDEX "ChangeLog_catalogEntryId_at_idx" ON "ChangeLog"("catalogEntryId", "at");

-- CreateIndex
CREATE INDEX "ChangeLog_at_idx" ON "ChangeLog"("at");

-- CreateIndex
CREATE INDEX "ChangeLog_batchId_idx" ON "ChangeLog"("batchId");

-- CreateIndex
CREATE INDEX "AiringScheduleEntry_catalogEntryId_idx" ON "AiringScheduleEntry"("catalogEntryId");

-- CreateIndex
CREATE INDEX "Anime_catalogEntryId_idx" ON "Anime"("catalogEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Production_catalogEntryId_key" ON "Production"("catalogEntryId");

-- AddForeignKey
ALTER TABLE "Anime" ADD CONSTRAINT "Anime_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiringScheduleEntry" ADD CONSTRAINT "AiringScheduleEntry_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: cada cópia aponta para a obra do catálogo com o mesmo anilistId (o vínculo que o código já usava).
UPDATE "Production" p SET "catalogEntryId" = c."id" FROM "CatalogEntry" c WHERE c."anilistId" = p."anilistId" AND p."catalogEntryId" IS NULL;
UPDATE "Anime" a SET "catalogEntryId" = c."id" FROM "CatalogEntry" c WHERE c."anilistId" = a."anilistId" AND a."catalogEntryId" IS NULL;
UPDATE "AiringScheduleEntry" s SET "catalogEntryId" = c."id" FROM "CatalogEntry" c WHERE c."anilistId" = s."anilistId" AND s."catalogEntryId" IS NULL;
