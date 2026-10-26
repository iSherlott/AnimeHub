-- Comunidade das obras sem AniList ID (só do AniDB/Kitsu): publicações, comentários e quiz passam a poder apontar para
-- a obra do catálogo. Só acrescenta colunas/índices e relaxa o AniList ID de Comment e Quiz; nada é apagado.
-- Apagar a obra do catálogo não apaga a comunidade (SET NULL).

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "catalogEntryId" TEXT,
ALTER COLUMN "anilistId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "catalogEntryId" TEXT;

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "catalogEntryId" TEXT,
ALTER COLUMN "anilistId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Comment_catalogEntryId_idx" ON "Comment"("catalogEntryId");

-- CreateIndex
CREATE INDEX "Post_catalogEntryId_idx" ON "Post"("catalogEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Quiz_catalogEntryId_key" ON "Quiz"("catalogEntryId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

