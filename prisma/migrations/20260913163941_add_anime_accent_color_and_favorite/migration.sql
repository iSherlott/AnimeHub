-- AlterTable
ALTER TABLE "Anime" ADD COLUMN     "accentColor" TEXT,
ADD COLUMN     "favoritedAt" TIMESTAMP(3),
ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Anime_userId_isFavorite_idx" ON "Anime"("userId", "isFavorite");
