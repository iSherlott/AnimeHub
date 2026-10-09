-- AlterTable
ALTER TABLE "AiringAlert" ADD COLUMN     "previousAiringAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SocialNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialNotification_userId_readAt_createdAt_idx" ON "SocialNotification"("userId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "SocialNotification" ADD CONSTRAINT "SocialNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialNotification" ADD CONSTRAINT "SocialNotification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
