-- AlterTable
ALTER TABLE "CommunityReport" ADD COLUMN     "eventId" TEXT;

-- AlterTable
ALTER TABLE "ProfileAlbum" ADD COLUMN     "removedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProfileReport" ADD COLUMN     "albumId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "birthdayCheckedOn" TEXT;

-- CreateIndex
CREATE INDEX "ProfileReport_albumId_idx" ON "ProfileReport"("albumId");

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CommunityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileReport" ADD CONSTRAINT "ProfileReport_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "ProfileAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

