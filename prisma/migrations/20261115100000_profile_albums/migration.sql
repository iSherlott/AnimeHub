-- CreateTable
CREATE TABLE "ProfileAlbum" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileAlbumItem" (
    "albumId" TEXT NOT NULL,
    "animeId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileAlbumItem_pkey" PRIMARY KEY ("albumId","animeId")
);

-- CreateIndex
CREATE INDEX "ProfileAlbum_userId_createdAt_idx" ON "ProfileAlbum"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProfileAlbumItem_animeId_idx" ON "ProfileAlbumItem"("animeId");

-- AddForeignKey
ALTER TABLE "ProfileAlbum" ADD CONSTRAINT "ProfileAlbum_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAlbumItem" ADD CONSTRAINT "ProfileAlbumItem_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "ProfileAlbum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAlbumItem" ADD CONSTRAINT "ProfileAlbumItem_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

