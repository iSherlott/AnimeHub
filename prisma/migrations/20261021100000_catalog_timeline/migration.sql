-- AlterTable
ALTER TABLE "CatalogEntry" ADD COLUMN     "franchiseKey" INTEGER,
ADD COLUMN     "timelineAt" TIMESTAMP(3),
ADD COLUMN     "timelineOrder" INTEGER,
ADD COLUMN     "timelineRole" TEXT,
ADD COLUMN     "timelineSeason" INTEGER;

-- CreateIndex
CREATE INDEX "CatalogEntry_franchiseKey_timelineOrder_idx" ON "CatalogEntry"("franchiseKey", "timelineOrder");
