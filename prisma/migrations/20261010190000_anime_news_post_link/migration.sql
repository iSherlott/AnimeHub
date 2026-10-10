-- AlterTable
ALTER TABLE "AnimeNews" ADD COLUMN     "postId" TEXT;

-- CreateIndex
CREATE INDEX "AnimeNews_postId_idx" ON "AnimeNews"("postId");
