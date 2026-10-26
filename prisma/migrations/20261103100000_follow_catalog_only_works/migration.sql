-- Acompanhar obras sem AniList ID (só do AniDB ou da Kitsu): o item de lista passa a poder não ter `anilistId`; a
-- identidade é a obra do catálogo, uma vez por pessoa. Só relaxa uma coluna e acrescenta um índice.

-- Antes do índice único: a mesma pessoa com dois itens na mesma obra do catálogo não deveria existir (cada obra tem um só
-- AniList ID). Se existir, a migração para aqui com a lista, em vez de escolher sozinha qual item fica.
DO $$
DECLARE
  dup TEXT;
BEGIN
  SELECT string_agg(format('usuário %s, obra %s (%s itens)', "userId", "catalogEntryId", n), '; ')
    INTO dup
    FROM (SELECT "userId", "catalogEntryId", count(*) AS n FROM "Anime" WHERE "catalogEntryId" IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'Itens de lista repetidos na mesma obra do catálogo; junte-os antes de migrar: %', dup;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Anime" ALTER COLUMN "anilistId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Anime_userId_catalogEntryId_key" ON "Anime"("userId", "catalogEntryId");
