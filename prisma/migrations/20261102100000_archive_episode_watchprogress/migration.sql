-- Fase 11 (ADR 0009): as tabelas descontinuadas `Episode` (cópia POR USUÁRIO dos episódios, substituída pelo episódio
-- global em `AiringScheduleEntry`) e `WatchProgress` (progresso por episódio, proibido: acompanhar é por obra) saem do
-- schema do app. NÃO são apagadas: vão para o schema "animehub_archive", fora do Prisma, com os dados intactos.
--
-- Por que arquivar e não apagar: a cópia de `Episode` para o episódio global (migração 20261026100000) deixou de fora,
-- de propósito, o que era ambíguo (número repetido dentro da mesma obra — temporadas internas da Kitsu — e o episódio 0).
-- Essas linhas só existem aqui.
--
-- Voltar:          ALTER TABLE "animehub_archive"."Episode" SET SCHEMA <schema do app>;  (idem "WatchProgress")
-- Apagar de vez:   DROP SCHEMA "animehub_archive" CASCADE;   (depois de conferir que nada ali é necessário)

-- Sem a chave estrangeira, o arquivo não depende mais do item de lista; a obra (anilistId) e a pessoa (userId) ficam
-- gravadas em cada linha para o arquivo continuar legível mesmo se o item de lista for removido depois.
ALTER TABLE "Episode" ADD COLUMN "anilistId" INTEGER, ADD COLUMN "userId" TEXT;
UPDATE "Episode" e SET "anilistId" = a."anilistId", "userId" = a."userId" FROM "Anime" a WHERE a."id" = e."animeId";
ALTER TABLE "Episode" DROP CONSTRAINT "Episode_animeId_fkey";

ALTER TABLE "WatchProgress" ADD COLUMN "anilistId" INTEGER, ADD COLUMN "userId" TEXT;
UPDATE "WatchProgress" w SET "anilistId" = a."anilistId", "userId" = a."userId" FROM "Anime" a WHERE a."id" = w."animeId";
ALTER TABLE "WatchProgress" DROP CONSTRAINT "WatchProgress_animeId_fkey";

-- O schema de arquivo fica fora do banco do app e sobrevive a quem recria só o schema do app (banco-sombra do Prisma,
-- banco de testes). Se ele já tiver as tabelas de uma aplicação anterior desta migração:
--   - tabela vazia aqui: nada a arquivar, ela só sai;
--   - tabela com linhas: vai para um arquivo novo, com data e hora no nome — nunca se perde nem sobrescreve nada.
CREATE SCHEMA IF NOT EXISTS "animehub_archive";
DO $$
DECLARE
  t TEXT;
  target TEXT;
  has_rows BOOLEAN;
BEGIN
  FOREACH t IN ARRAY ARRAY['Episode', 'WatchProgress'] LOOP
    IF to_regclass(format('%I.%I', 'animehub_archive', t)) IS NULL THEN
      EXECUTE format('ALTER TABLE %I SET SCHEMA %I', t, 'animehub_archive');
    ELSE
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', t) INTO has_rows;
      IF has_rows THEN
        target := 'animehub_archive_' || to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS');
        EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', target);
        EXECUTE format('ALTER TABLE %I SET SCHEMA %I', t, target);
      ELSE
        EXECUTE format('DROP TABLE %I', t);
      END IF;
    END IF;
  END LOOP;
END $$;
