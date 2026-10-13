-- CreateTable
CREATE TABLE "WorkLink" (
    "id" TEXT NOT NULL,
    "earlierAnilistId" INTEGER NOT NULL,
    "laterAnilistId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "undoJson" TEXT,
    "decidedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkLink_status_idx" ON "WorkLink"("status");

-- CreateIndex
CREATE INDEX "WorkLink_laterAnilistId_idx" ON "WorkLink"("laterAnilistId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkLink_earlierAnilistId_laterAnilistId_key" ON "WorkLink"("earlierAnilistId", "laterAnilistId");
