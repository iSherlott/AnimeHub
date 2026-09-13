-- CreateTable
CREATE TABLE "AiringAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "episode" INTEGER NOT NULL,
    "airingAt" TIMESTAMP(3) NOT NULL,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiringAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiringAlert_userId_seenAt_idx" ON "AiringAlert"("userId", "seenAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiringAlert_userId_anilistId_episode_key" ON "AiringAlert"("userId", "anilistId", "episode");

-- AddForeignKey
ALTER TABLE "AiringAlert" ADD CONSTRAINT "AiringAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
