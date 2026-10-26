-- AlterTable
ALTER TABLE "Scrap" ADD COLUMN     "replyToId" TEXT;

-- CreateIndex
CREATE INDEX "Scrap_authorId_profileId_idx" ON "Scrap"("authorId", "profileId");

-- AddForeignKey
ALTER TABLE "Scrap" ADD CONSTRAINT "Scrap_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Scrap"("id") ON DELETE SET NULL ON UPDATE CASCADE;

