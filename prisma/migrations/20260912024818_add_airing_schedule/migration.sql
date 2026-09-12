-- CreateTable
CREATE TABLE "AiringScheduleEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anilistId" INTEGER NOT NULL,
    "episode" INTEGER NOT NULL,
    "airingAt" DATETIME NOT NULL,
    "titleRomaji" TEXT NOT NULL,
    "titleEnglish" TEXT,
    "titleNative" TEXT,
    "coverImage" TEXT,
    "bannerImage" TEXT,
    "genres" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AiringScheduleEntry_airingAt_idx" ON "AiringScheduleEntry"("airingAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiringScheduleEntry_anilistId_episode_key" ON "AiringScheduleEntry"("anilistId", "episode");
