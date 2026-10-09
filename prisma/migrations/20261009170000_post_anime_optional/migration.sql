-- Publicar sem obra associada é válido (Figma 13:41840, D-27): contexto de anime opcional.
ALTER TABLE "Post" ALTER COLUMN "anilistId" DROP NOT NULL,
ALTER COLUMN "animeTitleRomaji" DROP NOT NULL;
