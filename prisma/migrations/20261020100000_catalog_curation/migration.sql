-- AlterTable
ALTER TABLE "Anime" ADD COLUMN     "scoredAt" TIMESTAMP(3),
ADD COLUMN     "userScore" INTEGER;

-- AlterTable
ALTER TABLE "CatalogEntry" ADD COLUMN     "curatedAt" TIMESTAMP(3),
ADD COLUMN     "curationVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "descriptionJa" TEXT,
ADD COLUMN     "descriptionPt" TEXT,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "officialSite" TEXT,
ADD COLUMN     "relationsJson" TEXT,
ADD COLUMN     "siteScore" DOUBLE PRECISION NOT NULL DEFAULT 5,
ADD COLUMN     "siteScoreVotes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CurationIssue" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "anilistId" INTEGER,
    "anidbId" INTEGER,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurationIssue_code_status_idx" ON "CurationIssue"("code", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CurationIssue_entryId_code_key" ON "CurationIssue"("entryId", "code");

-- CreateIndex
CREATE INDEX "CatalogEntry_kind_idx" ON "CatalogEntry"("kind");