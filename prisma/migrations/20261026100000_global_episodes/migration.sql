-- Fase 4 (ADR 0009): o episódio passa a ser global — a linha da agenda (AiringScheduleEntry) ganha título, sinopse,
-- imagem, certeza da data, situação, fonte e campos protegidos. A cópia por usuário (Episode) deixa de receber
-- gravações e é copiada para cá. "Adiar" passa a valer para a obra (PendingEpisode.fromEpisode opcional).
-- Só acrescenta e copia: nada é apagado.

-- AlterTable
ALTER TABLE "AiringScheduleEntry" ADD COLUMN     "airDate" DATE,
ADD COLUMN     "dateCertainty" TEXT NOT NULL DEFAULT 'EXACT',
ADD COLUMN     "episodeTitle" TEXT,
ADD COLUMN     "episodeTitleEn" TEXT,
ADD COLUMN     "episodeTitleJa" TEXT,
ADD COLUMN     "manualFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'anilist',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "synopsis" TEXT,
ADD COLUMN     "thumbnail" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "airingAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PendingEpisode" ALTER COLUMN "fromEpisode" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EpisodeSourceCheck" (
    "anilistId" INTEGER NOT NULL,
    "kitsuId" INTEGER,
    "found" INTEGER NOT NULL DEFAULT 0,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeSourceCheck_pkey" PRIMARY KEY ("anilistId")
);

-- Backfill 1: episódios por usuário → episódio global. Por obra vale a cópia mais completa (a de quem tem mais
-- episódios). Número repetido dentro da mesma cópia (temporadas internas da Kitsu, que reiniciam a contagem) é
-- ambíguo e fica de fora. Horário nunca é inventado: a cópia antiga só tem o dia (DATE_ONLY) ou nada (UNKNOWN).
-- Episódio que a agenda já tinha mantém data e hora; só recebe título, sinopse e imagem que faltavam.
WITH per_anime AS (
  SELECT e."animeId", e."number", e."titleRomaji", e."titleEnglish", e."titleJapanese", e."synopsis", e."thumbnail", e."airDate",
         a."anilistId", a."titleRomaji" AS work_romaji, a."titleEnglish" AS work_english, a."titleNative" AS work_native,
         COUNT(*) OVER (PARTITION BY e."animeId", e."number") AS dup,
         COUNT(*) OVER (PARTITION BY e."animeId") AS total
  FROM "Episode" e
  JOIN "Anime" a ON a."id" = e."animeId"
  WHERE e."number" > 0
), best AS (
  SELECT DISTINCT ON (p."anilistId") p."anilistId", p."animeId"
  FROM per_anime p
  ORDER BY p."anilistId", p.total DESC, p."animeId"
)
INSERT INTO "AiringScheduleEntry" ("id", "anilistId", "catalogEntryId", "episode", "airingAt", "titleRomaji", "titleEnglish", "titleNative",
  "episodeTitle", "episodeTitleEn", "episodeTitleJa", "synopsis", "thumbnail", "airDate", "dateCertainty", "source")
SELECT 'ep' || md5(p."anilistId"::text || '-' || p."number"::text), p."anilistId", c."id", p."number", NULL, p.work_romaji, p.work_english, p.work_native,
       p."titleRomaji", p."titleEnglish", p."titleJapanese", p."synopsis", p."thumbnail", p."airDate"::date,
       CASE WHEN p."airDate" IS NULL THEN 'UNKNOWN' ELSE 'DATE_ONLY' END, 'legacy'
FROM per_anime p
JOIN best b ON b."animeId" = p."animeId"
LEFT JOIN "CatalogEntry" c ON c."anilistId" = p."anilistId"
WHERE p.dup = 1
ON CONFLICT ("anilistId", "episode") DO UPDATE SET
  "episodeTitle" = COALESCE("AiringScheduleEntry"."episodeTitle", EXCLUDED."episodeTitle"),
  "episodeTitleEn" = COALESCE("AiringScheduleEntry"."episodeTitleEn", EXCLUDED."episodeTitleEn"),
  "episodeTitleJa" = COALESCE("AiringScheduleEntry"."episodeTitleJa", EXCLUDED."episodeTitleJa"),
  "synopsis" = COALESCE("AiringScheduleEntry"."synopsis", EXCLUDED."synopsis"),
  "thumbnail" = COALESCE("AiringScheduleEntry"."thumbnail", EXCLUDED."thumbnail");

-- Backfill 2: imagens já baixadas para o calendário (EpisodeImage) viram a imagem do episódio global.
UPDATE "AiringScheduleEntry" s SET "thumbnail" = i."thumbnail"
FROM "EpisodeImage" i
WHERE i."anilistId" = s."anilistId" AND i."episode" = s."episode" AND s."thumbnail" IS NULL;

-- Backfill 3: obras que já tinham episódios copiados não precisam consultar a Kitsu de novo.
INSERT INTO "EpisodeSourceCheck" ("anilistId", "found")
SELECT s."anilistId", COUNT(*) FROM "AiringScheduleEntry" s WHERE s."source" = 'legacy' GROUP BY s."anilistId"
ON CONFLICT ("anilistId") DO NOTHING;
