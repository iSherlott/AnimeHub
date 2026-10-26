-- CreateTable
CREATE TABLE "ProfileReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "scrapId" TEXT,
    "testimonialId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "action" TEXT,

    CONSTRAINT "ProfileReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfileReport_resolvedAt_idx" ON "ProfileReport"("resolvedAt");

-- CreateIndex
CREATE INDEX "ProfileReport_scrapId_idx" ON "ProfileReport"("scrapId");

-- CreateIndex
CREATE INDEX "ProfileReport_testimonialId_idx" ON "ProfileReport"("testimonialId");

-- AddForeignKey
ALTER TABLE "ProfileReport" ADD CONSTRAINT "ProfileReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileReport" ADD CONSTRAINT "ProfileReport_scrapId_fkey" FOREIGN KEY ("scrapId") REFERENCES "Scrap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileReport" ADD CONSTRAINT "ProfileReport_testimonialId_fkey" FOREIGN KEY ("testimonialId") REFERENCES "Testimonial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileReport" ADD CONSTRAINT "ProfileReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

