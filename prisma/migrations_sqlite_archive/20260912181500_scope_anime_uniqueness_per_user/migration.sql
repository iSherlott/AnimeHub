-- DropIndex
DROP INDEX "Anime_kitsuId_key";

-- DropIndex
DROP INDEX "Anime_anilistId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Anime_userId_anilistId_key" ON "Anime"("userId", "anilistId");

-- CreateIndex
CREATE UNIQUE INDEX "Anime_userId_kitsuId_key" ON "Anime"("userId", "kitsuId");
