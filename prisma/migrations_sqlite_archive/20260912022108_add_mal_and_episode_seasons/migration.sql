-- AlterTable
ALTER TABLE "Anime" ADD COLUMN "lastRefreshedAt" DATETIME;
ALTER TABLE "Anime" ADD COLUMN "malId" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "animeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "seasonNumber" INTEGER NOT NULL DEFAULT 1,
    "titleRomaji" TEXT,
    "titleJapanese" TEXT,
    "thumbnail" TEXT,
    "airDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Episode_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Episode" ("airDate", "animeId", "createdAt", "id", "number", "thumbnail", "titleJapanese", "titleRomaji") SELECT "airDate", "animeId", "createdAt", "id", "number", "thumbnail", "titleJapanese", "titleRomaji" FROM "Episode";
DROP TABLE "Episode";
ALTER TABLE "new_Episode" RENAME TO "Episode";
CREATE UNIQUE INDEX "Episode_animeId_number_key" ON "Episode"("animeId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
