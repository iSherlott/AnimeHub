-- AlterTable
ALTER TABLE "Production" ADD COLUMN     "streamingLinksJson" TEXT;

-- CreateTable
CREATE TABLE "EpisodeImage" (
    "anilistId" INTEGER NOT NULL,
    "episode" INTEGER NOT NULL,
    "thumbnail" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'kitsu',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeImage_pkey" PRIMARY KEY ("anilistId","episode")
);

-- CreateTable
CREATE TABLE "EpisodeImageSource" (
    "anilistId" INTEGER NOT NULL,
    "kitsuId" INTEGER,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeImageSource_pkey" PRIMARY KEY ("anilistId")
);

-- CreateTable
CREATE TABLE "EpisodeImageRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "animes" INTEGER NOT NULL DEFAULT 0,
    "found" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "adminName" TEXT,

    CONSTRAINT "EpisodeImageRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EpisodeImageRun_startedAt_idx" ON "EpisodeImageRun"("startedAt");
