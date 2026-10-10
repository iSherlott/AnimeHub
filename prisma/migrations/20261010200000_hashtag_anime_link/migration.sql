-- AlterTable
ALTER TABLE "Hashtag" ADD COLUMN     "anilistId" INTEGER;

-- CreateIndex
CREATE INDEX "Hashtag_anilistId_idx" ON "Hashtag"("anilistId");
