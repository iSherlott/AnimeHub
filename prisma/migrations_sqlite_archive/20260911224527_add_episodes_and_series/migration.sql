-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "animeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "titleRomaji" TEXT,
    "titleJapanese" TEXT,
    "thumbnail" TEXT,
    "airDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Episode_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Anime" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anilistId" INTEGER NOT NULL,
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
    "seriesKey" TEXT,
    "seasonNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Anime" ("anilistId", "bannerImage", "coverImage", "createdAt", "description", "episodes", "genres", "id", "season", "seasonYear", "status", "titleEnglish", "titleNative", "titleRomaji", "updatedAt") SELECT "anilistId", "bannerImage", "coverImage", "createdAt", "description", "episodes", "genres", "id", "season", "seasonYear", "status", "titleEnglish", "titleNative", "titleRomaji", "updatedAt" FROM "Anime";
DROP TABLE "Anime";
ALTER TABLE "new_Anime" RENAME TO "Anime";
CREATE UNIQUE INDEX "Anime_anilistId_key" ON "Anime"("anilistId");
CREATE UNIQUE INDEX "Anime_kitsuId_key" ON "Anime"("kitsuId");
CREATE INDEX "Anime_seriesKey_idx" ON "Anime"("seriesKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Episode_animeId_number_key" ON "Episode"("animeId", "number");
