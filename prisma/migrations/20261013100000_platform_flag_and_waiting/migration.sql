-- AlterTable
ALTER TABLE "Anime" ADD COLUMN     "waiting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waitingSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CatalogEntry" ADD COLUMN     "onPlatform" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Anime_userId_waiting_idx" ON "Anime"("userId", "waiting");

-- CreateIndex
CREATE INDEX "CatalogEntry_onPlatform_idx" ON "CatalogEntry"("onPlatform");
