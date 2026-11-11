-- AlterTable
ALTER TABLE "AnimeNews" ADD COLUMN     "imageCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "bodyLang" TEXT;

-- CreateTable
CREATE TABLE "PostTranslation" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "workKey" TEXT NOT NULL,
    "note" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostTranslation_postId_lang_key" ON "PostTranslation"("postId", "lang");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationLink_code_key" ON "RecommendationLink"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationLink_fromId_workKey_key" ON "RecommendationLink"("fromId", "workKey");

-- AddForeignKey
ALTER TABLE "PostTranslation" ADD CONSTRAINT "PostTranslation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationLink" ADD CONSTRAINT "RecommendationLink_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

