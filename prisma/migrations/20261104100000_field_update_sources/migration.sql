-- Atualização seletiva também pela Kitsu e pelo AniDB: cada item guarda o identificador da obra na fonte do lote
-- (AdminJob.source). Só acrescenta uma coluna; os lotes antigos (só AniList) continuam valendo pelo `anilistId`.

-- AlterTable
ALTER TABLE "FieldUpdateItem" ADD COLUMN     "sourceId" INTEGER;
