-- CreateTable
CREATE TABLE "Franchise" (
    "id" TEXT NOT NULL,
    "rootAnilistId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Franchise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Production" (
    "id" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "franchiseId" TEXT NOT NULL,
    "seasonNumber" INTEGER NOT NULL DEFAULT 1,
    "format" TEXT,
    "titleRomaji" TEXT NOT NULL,
    "titleEnglish" TEXT,
    "titleNative" TEXT,
    "coverImage" TEXT,
    "bannerImage" TEXT,
    "description" TEXT,
    "episodes" INTEGER,
    "status" TEXT,
    "season" TEXT,
    "seasonYear" INTEGER,
    "genres" TEXT,
    "officialSite" TEXT,
    "relationsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Production_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Franchise_rootAnilistId_key" ON "Franchise"("rootAnilistId");

-- CreateIndex
CREATE UNIQUE INDEX "Production_anilistId_key" ON "Production"("anilistId");

-- CreateIndex
CREATE INDEX "Production_franchiseId_idx" ON "Production"("franchiseId");

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
