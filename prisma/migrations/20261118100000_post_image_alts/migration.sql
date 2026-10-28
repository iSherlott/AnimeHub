-- Descrição das imagens das publicações (texto alternativo), na mesma ordem de "imageUrls".
-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "imageAlts" TEXT[] NOT NULL DEFAULT '{}';
