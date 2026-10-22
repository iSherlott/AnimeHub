-- CreateTable
CREATE TABLE "StoryLink" (
    "id" TEXT NOT NULL,
    "oldAnilistId" INTEGER NOT NULL,
    "newAnilistId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'REBOOT',
    "coverage" TEXT NOT NULL DEFAULT 'FULL',
    "beyondFromEpisode" INTEGER,
    "note" TEXT,
    "source" TEXT,
    "loot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryArc" (
    "id" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "nameEn" TEXT NOT NULL,
    "namePt" TEXT,
    "nameJa" TEXT,
    "startEpisode" INTEGER NOT NULL,
    "endEpisode" INTEGER NOT NULL,
    "source" TEXT,
    "loot" TEXT,

    CONSTRAINT "StoryArc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryReview" (
    "id" TEXT NOT NULL,
    "anilistIdA" INTEGER NOT NULL,
    "anilistIdB" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "note" TEXT,
    "source" TEXT,
    "loot" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryLink_newAnilistId_idx" ON "StoryLink"("newAnilistId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryLink_oldAnilistId_newAnilistId_key" ON "StoryLink"("oldAnilistId", "newAnilistId");

-- CreateIndex
CREATE INDEX "StoryArc_anilistId_idx" ON "StoryArc"("anilistId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryArc_anilistId_position_key" ON "StoryArc"("anilistId", "position");

-- CreateIndex
CREATE INDEX "StoryReview_verdict_idx" ON "StoryReview"("verdict");

-- CreateIndex
CREATE UNIQUE INDEX "StoryReview_anilistIdA_anilistIdB_key" ON "StoryReview"("anilistIdA", "anilistIdB");
