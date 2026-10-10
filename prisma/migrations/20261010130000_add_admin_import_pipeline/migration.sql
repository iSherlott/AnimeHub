-- AlterTable
ALTER TABLE "Production" ADD COLUMN     "anidbId" INTEGER;

-- AlterTable
ALTER TABLE "CatalogEntry" ADD COLUMN     "anidbId" INTEGER;

-- CreateTable
CREATE TABLE "AdminJob" (
    "seq" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "season" TEXT,
    "state" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "parserVersion" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "htmlBytes" INTEGER,
    "html" TEXT,
    "adminId" TEXT,
    "adminName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AdminJob_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "ImportRecord" (
    "id" TEXT NOT NULL,
    "jobSeq" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "titleRomaji" TEXT NOT NULL,
    "titleNative" TEXT,
    "titleEnglish" TEXT,
    "seasonLabel" TEXT,
    "year" INTEGER,
    "format" TEXT,
    "airsAt" TIMESTAMP(3),
    "airsAtHasTime" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedProductionId" TEXT,
    "matchedAnilistId" INTEGER,
    "score" DOUBLE PRECISION,
    "scoreDetail" TEXT,
    "state" TEXT NOT NULL,
    "note" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogConflict" (
    "id" TEXT NOT NULL,
    "jobSeq" INTEGER,
    "anilistId" INTEGER NOT NULL,
    "episode" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "aValue" TIMESTAMP(3) NOT NULL,
    "aSource" TEXT NOT NULL,
    "bValue" TIMESTAMP(3) NOT NULL,
    "bSource" TEXT NOT NULL,
    "bMeta" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT,
    "resolvedValue" TIMESTAMP(3),
    "reason" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogOverride" (
    "id" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "episode" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "originalValue" TIMESTAMP(3) NOT NULL,
    "originalSource" TEXT NOT NULL,
    "value" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedByName" TEXT,

    CONSTRAINT "CatalogOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobSeq" INTEGER,
    "source" TEXT,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT,
    "adminName" TEXT,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Production_anidbId_key" ON "Production"("anidbId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogEntry_anidbId_key" ON "CatalogEntry"("anidbId");

-- CreateIndex
CREATE INDEX "AdminJob_createdAt_idx" ON "AdminJob"("createdAt");

-- CreateIndex
CREATE INDEX "ImportRecord_jobSeq_state_idx" ON "ImportRecord"("jobSeq", "state");

-- CreateIndex
CREATE INDEX "CatalogConflict_status_createdAt_idx" ON "CatalogConflict"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogConflict_anilistId_episode_idx" ON "CatalogConflict"("anilistId", "episode");

-- CreateIndex
CREATE INDEX "CatalogOverride_anilistId_episode_removedAt_idx" ON "CatalogOverride"("anilistId", "episode", "removedAt");

-- CreateIndex
CREATE INDEX "AdminLog_at_idx" ON "AdminLog"("at");

-- CreateIndex
CREATE INDEX "AdminLog_jobSeq_at_idx" ON "AdminLog"("jobSeq", "at");

-- AddForeignKey
ALTER TABLE "ImportRecord" ADD CONSTRAINT "ImportRecord_jobSeq_fkey" FOREIGN KEY ("jobSeq") REFERENCES "AdminJob"("seq") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogConflict" ADD CONSTRAINT "CatalogConflict_jobSeq_fkey" FOREIGN KEY ("jobSeq") REFERENCES "AdminJob"("seq") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminLog" ADD CONSTRAINT "AdminLog_jobSeq_fkey" FOREIGN KEY ("jobSeq") REFERENCES "AdminJob"("seq") ON DELETE SET NULL ON UPDATE CASCADE;
