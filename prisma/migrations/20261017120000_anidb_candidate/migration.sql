-- CreateTable
CREATE TABLE "AnidbCandidate" (
    "id" TEXT NOT NULL,
    "anidbId" INTEGER NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "candidateTitle" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnidbCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnidbCandidate_anidbId_key" ON "AnidbCandidate"("anidbId");

-- CreateIndex
CREATE INDEX "AnidbCandidate_status_idx" ON "AnidbCandidate"("status");
