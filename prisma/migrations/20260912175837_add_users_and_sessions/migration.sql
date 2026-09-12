-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Anime" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "anilistId" INTEGER NOT NULL,
    "kitsuId" INTEGER,
    "malId" INTEGER,
    "shikimoriId" INTEGER,
    "anidbId" INTEGER,
    "anidbRating" REAL,
    "anidbVotes" INTEGER,
    "averageScore" INTEGER,
    "anidbAwards" TEXT,
    "anidbResources" TEXT,
    "anidbTitles" TEXT,
    "lastRefreshedAt" DATETIME,
    "titleRomaji" TEXT NOT NULL,
    "titleEnglish" TEXT,
    "titleNative" TEXT,
    "titlePortuguese" TEXT,
    "titleFurigana" TEXT,
    "coverImage" TEXT,
    "bannerImage" TEXT,
    "description" TEXT,
    "episodes" INTEGER,
    "format" TEXT,
    "status" TEXT,
    "season" TEXT,
    "seasonYear" INTEGER,
    "genres" TEXT,
    "seriesKey" TEXT,
    "seasonNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Anime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Anime" ("anidbAwards", "anidbId", "anidbRating", "anidbResources", "anidbTitles", "anidbVotes", "anilistId", "averageScore", "bannerImage", "coverImage", "createdAt", "description", "episodes", "format", "genres", "id", "kitsuId", "lastRefreshedAt", "malId", "season", "seasonNumber", "seasonYear", "seriesKey", "shikimoriId", "status", "titleEnglish", "titleFurigana", "titleNative", "titlePortuguese", "titleRomaji", "updatedAt") SELECT "anidbAwards", "anidbId", "anidbRating", "anidbResources", "anidbTitles", "anidbVotes", "anilistId", "averageScore", "bannerImage", "coverImage", "createdAt", "description", "episodes", "format", "genres", "id", "kitsuId", "lastRefreshedAt", "malId", "season", "seasonNumber", "seasonYear", "seriesKey", "shikimoriId", "status", "titleEnglish", "titleFurigana", "titleNative", "titlePortuguese", "titleRomaji", "updatedAt" FROM "Anime";
DROP TABLE "Anime";
ALTER TABLE "new_Anime" RENAME TO "Anime";
CREATE UNIQUE INDEX "Anime_anilistId_key" ON "Anime"("anilistId");
CREATE UNIQUE INDEX "Anime_kitsuId_key" ON "Anime"("kitsuId");
CREATE INDEX "Anime_seriesKey_idx" ON "Anime"("seriesKey");
CREATE INDEX "Anime_userId_idx" ON "Anime"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
