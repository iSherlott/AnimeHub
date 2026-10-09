-- AlterTable
ALTER TABLE "User" ADD COLUMN     "titleFormat" TEXT,
ADD COLUMN     "timeZone" TEXT,
ADD COLUMN     "notifyReleases" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReplies" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyComments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyFollowers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyLikes" BOOLEAN NOT NULL DEFAULT false;
