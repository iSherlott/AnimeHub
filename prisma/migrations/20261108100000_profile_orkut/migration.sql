-- Perfil estilo Orkut: quem sou eu (favoritos), recados, depoimentos, fãs e avaliações.
-- Só acrescenta colunas e tabelas.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "favoriteAnime" TEXT,
ADD COLUMN     "favoriteCharacter" TEXT,
ADD COLUMN     "favoriteGenres" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Scrap" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Scrap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fan" (
    "fanId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fan_pkey" PRIMARY KEY ("fanId","targetId")
);

-- CreateTable
CREATE TABLE "ProfileRating" (
    "raterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "otaku" INTEGER NOT NULL DEFAULT 0,
    "gentil" INTEGER NOT NULL DEFAULT 0,
    "semSpoiler" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileRating_pkey" PRIMARY KEY ("raterId","targetId")
);

-- CreateIndex
CREATE INDEX "Scrap_profileId_deletedAt_createdAt_idx" ON "Scrap"("profileId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Testimonial_profileId_status_idx" ON "Testimonial"("profileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Testimonial_profileId_authorId_key" ON "Testimonial"("profileId", "authorId");

-- CreateIndex
CREATE INDEX "Fan_targetId_idx" ON "Fan"("targetId");

-- CreateIndex
CREATE INDEX "ProfileRating_targetId_idx" ON "ProfileRating"("targetId");

-- AddForeignKey
ALTER TABLE "Scrap" ADD CONSTRAINT "Scrap_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scrap" ADD CONSTRAINT "Scrap_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fan" ADD CONSTRAINT "Fan_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fan" ADD CONSTRAINT "Fan_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileRating" ADD CONSTRAINT "ProfileRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileRating" ADD CONSTRAINT "ProfileRating_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

