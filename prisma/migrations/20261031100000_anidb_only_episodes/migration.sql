-- Episódios das obras sem AniList ID (obras só do AniDB): a identidade do episódio passa a ser também
-- (catalogEntryId, episode); anilistId fica opcional. Só acrescenta.

-- AlterTable
ALTER TABLE "AiringScheduleEntry" ALTER COLUMN "anilistId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AnidbEpisodeCheck" (
    "catalogEntryId" TEXT NOT NULL,
    "anidbId" INTEGER NOT NULL,
    "found" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnidbEpisodeCheck_pkey" PRIMARY KEY ("catalogEntryId")
);

-- Defesa: se algum dia duas linhas da mesma obra ficaram com o mesmo número (não deveria: a obra é única por anilistId),
-- a mais antiga perde só o vínculo (a verificação de integridade aponta), para o índice único poder ser criado.
UPDATE "AiringScheduleEntry" s SET "catalogEntryId" = NULL
WHERE s."catalogEntryId" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "AiringScheduleEntry" o
  WHERE o."catalogEntryId" = s."catalogEntryId" AND o."episode" = s."episode" AND o."id" <> s."id" AND o."updatedAt" > s."updatedAt"
);

-- CreateIndex
CREATE UNIQUE INDEX "AiringScheduleEntry_catalogEntryId_episode_key" ON "AiringScheduleEntry"("catalogEntryId", "episode");

