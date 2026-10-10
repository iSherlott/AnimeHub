-- AlterTable
ALTER TABLE "CatalogEntry" ADD COLUMN     "malId" INTEGER;

-- AlterTable
ALTER TABLE "ImportRecord" ADD COLUMN     "description" TEXT,
ADD COLUMN     "episodes" INTEGER,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "linksJson" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "synopsisLanguage" TEXT;

-- CreateTable
CREATE TABLE "TitleReading" (
    "text" TEXT NOT NULL,
    "kana" TEXT NOT NULL,
    "furiganaHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TitleReading_pkey" PRIMARY KEY ("text")
);

-- CreateTable
CREATE TABLE "SynopsisTranslation" (
    "anilistId" INTEGER NOT NULL,
    "lang" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SynopsisTranslation_pkey" PRIMARY KEY ("anilistId","lang")
);

-- CreateTable
CREATE TABLE "AnimeNews" (
    "id" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "imageUrl" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MyAnimeList',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimeNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "animes" INTEGER NOT NULL DEFAULT 0,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "adminName" TEXT,

    CONSTRAINT "NewsRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnimeNews_publishedAt_idx" ON "AnimeNews"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnimeNews_anilistId_url_key" ON "AnimeNews"("anilistId", "url");

-- CreateIndex
CREATE INDEX "NewsRun_startedAt_idx" ON "NewsRun"("startedAt");
