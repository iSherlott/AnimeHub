-- Comunidades: descrição, tópicos fixados/trancados, eventos com presença e denúncias para a moderação.
-- Só acrescenta colunas e tabelas.

-- AlterTable
ALTER TABLE "Community" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "CommunityTopic" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CommunityEvent" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "place" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CommunityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityEventRsvp" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityEventRsvp_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "topicId" TEXT,
    "replyId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "action" TEXT,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityEvent_communityId_deletedAt_startsAt_idx" ON "CommunityEvent"("communityId", "deletedAt", "startsAt");

-- CreateIndex
CREATE INDEX "CommunityReport_resolvedAt_idx" ON "CommunityReport"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReport_reporterId_topicId_replyId_key" ON "CommunityReport"("reporterId", "topicId", "replyId");

-- AddForeignKey
ALTER TABLE "CommunityEvent" ADD CONSTRAINT "CommunityEvent_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityEvent" ADD CONSTRAINT "CommunityEvent_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityEventRsvp" ADD CONSTRAINT "CommunityEventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CommunityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityEventRsvp" ADD CONSTRAINT "CommunityEventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CommunityTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "CommunityReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

