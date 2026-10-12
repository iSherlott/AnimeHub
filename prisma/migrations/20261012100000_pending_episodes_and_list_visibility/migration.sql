-- AlterTable
ALTER TABLE "User" ADD COLUMN     "animeListPublic" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PendingEpisode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "fromEpisode" INTEGER NOT NULL,
    "postponedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingEpisode_userId_idx" ON "PendingEpisode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingEpisode_userId_anilistId_key" ON "PendingEpisode"("userId", "anilistId");

-- AddForeignKey
ALTER TABLE "PendingEpisode" ADD CONSTRAINT "PendingEpisode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

