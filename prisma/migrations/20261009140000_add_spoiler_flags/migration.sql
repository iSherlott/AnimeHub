-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "isSpoiler" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PostComment" ADD COLUMN     "isSpoiler" BOOLEAN NOT NULL DEFAULT false;
