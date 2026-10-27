-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recordVisits" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProfileVisit" (
    "profileId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileVisit_pkey" PRIMARY KEY ("profileId","visitorId")
);

-- CreateIndex
CREATE INDEX "ProfileVisit_profileId_visitedAt_idx" ON "ProfileVisit"("profileId", "visitedAt");

-- AddForeignKey
ALTER TABLE "ProfileVisit" ADD CONSTRAINT "ProfileVisit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileVisit" ADD CONSTRAINT "ProfileVisit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

