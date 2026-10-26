-- AlterTable
ALTER TABLE "SocialNotification" ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "replyId" TEXT,
ADD COLUMN     "topicId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyCommunity" BOOLEAN NOT NULL DEFAULT true;

