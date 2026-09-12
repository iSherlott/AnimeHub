-- CreateTable
CREATE TABLE "CatalogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anilistId" INTEGER,
    "kitsuId" INTEGER,
    "titleRomaji" TEXT NOT NULL,
    "titleEnglish" TEXT,
    "titleNative" TEXT,
    "coverImage" TEXT,
    "bannerImage" TEXT,
    "description" TEXT,
    "episodes" INTEGER,
    "status" TEXT,
    "season" TEXT,
    "seasonYear" INTEGER,
    "genres" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "nextEpisodeNumber" INTEGER,
    "nextEpisodeAt" DATETIME,
    "source" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogEntry_anilistId_key" ON "CatalogEntry"("anilistId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogEntry_kitsuId_key" ON "CatalogEntry"("kitsuId");

-- CreateIndex
CREATE INDEX "CatalogEntry_season_seasonYear_idx" ON "CatalogEntry"("season", "seasonYear");
