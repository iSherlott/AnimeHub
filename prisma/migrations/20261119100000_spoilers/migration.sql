-- Sistema de spoiler (28/10): trecho e imagem com spoiler, aviso por obra e até onde, spoiler em recados, depoimentos e
-- eventos, e a preferência de cada pessoa. Só acrescenta.
-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "imageSpoilers" BOOLEAN[] NOT NULL DEFAULT '{}',
ADD COLUMN     "spoilerEpisode" INTEGER;

-- AlterTable
ALTER TABLE "CommunityTopic" ADD COLUMN     "spoilerEpisode" INTEGER;

-- AlterTable
ALTER TABLE "CommunityReply" ADD COLUMN     "spoilerEpisode" INTEGER;

-- AlterTable
ALTER TABLE "Scrap" ADD COLUMN     "isSpoiler" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Testimonial" ADD COLUMN     "isSpoiler" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CommunityEvent" ADD COLUMN     "isSpoiler" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showSpoilers" BOOLEAN NOT NULL DEFAULT false;
