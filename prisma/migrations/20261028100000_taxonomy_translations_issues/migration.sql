-- Fase 7 (ADR 0010): gêneros como entidade (vocabulário + índice obra↔gênero mantido pelo banco), estado das
-- traduções e ciclo de vida das pendências (resolvida em, reaberturas, ignorar com justificativa). Só acrescenta.

-- AlterTable
ALTER TABLE "CatalogEntry" ADD COLUMN     "descriptionPtReviewedAt" TIMESTAMP(3),
ADD COLUMN     "descriptionPtReviewedBy" TEXT,
ADD COLUMN     "descriptionPtSource" TEXT,
ADD COLUMN     "descriptionPtStatus" TEXT;

-- AlterTable
ALTER TABLE "CurationIssue" ADD COLUMN     "dismissedBy" TEXT,
ADD COLUMN     "dismissedReason" TEXT,
ADD COLUMN     "reopenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Genre" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mergedInto" TEXT,
    "adult" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "registered" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Genre_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CatalogGenre" (
    "catalogEntryId" TEXT NOT NULL,
    "genreKey" TEXT NOT NULL,

    CONSTRAINT "CatalogGenre_pkey" PRIMARY KEY ("catalogEntryId","genreKey")
);

-- CreateIndex
CREATE INDEX "CatalogGenre_genreKey_idx" ON "CatalogGenre"("genreKey");

-- AddForeignKey
ALTER TABLE "CatalogGenre" ADD CONSTRAINT "CatalogGenre_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogGenre" ADD CONSTRAINT "CatalogGenre_genreKey_fkey" FOREIGN KEY ("genreKey") REFERENCES "Genre"("key") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Vocabulário inicial: os 18 gêneros da plataforma (src/lib/genreTaxonomy.ts) e o marcador adulto.
INSERT INTO "Genre" ("key", "label", "position", "adult") VALUES
  ('Mecha', 'Mecha', 1, false), ('Adventure', 'Adventure', 2, false), ('Drama', 'Drama', 3, false), ('Loli', 'Loli', 4, false),
  ('Shounen', 'Shounen', 5, false), ('Shoujo', 'Shoujo', 6, false), ('Shounen-ai', 'Shounen-ai', 7, false), ('Shoujo-ai', 'Shoujo-ai', 8, false),
  ('Yaoi', 'Yaoi', 9, false), ('Yuri', 'Yuri', 10, false), ('Josei', 'Josei', 11, false), ('Romance', 'Romance', 12, false),
  ('Sci-fi', 'Sci-fi', 13, false), ('Ecchi', 'Ecchi', 14, false), ('Isekai', 'Isekai', 15, false), ('Slice of Life', 'Slice of Life', 16, false),
  ('Comedy', 'Comedy', 17, false), ('Parody', 'Parody', 18, false), ('Hentai', 'Hentai', 19, true)
ON CONFLICT ("key") DO NOTHING;

-- Aplica o vocabulário a uma lista "A,B,C": variação e gênero mesclado viram o destino; excluído some; sem repetir.
CREATE OR REPLACE FUNCTION "animehub_canonical_genres"(input text) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  result text[] := ARRAY[]::text[];
  token text;
  found_key text;
  found_merged text;
  found_active boolean;
  target text;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  FOREACH token IN ARRAY string_to_array(input, ',') LOOP
    token := btrim(token);
    IF token = '' THEN CONTINUE; END IF;
    found_key := NULL;
    SELECT g."key", g."mergedInto", g."active" INTO found_key, found_merged, found_active
      FROM "Genre" g
      WHERE lower(g."key") = lower(token) OR lower(token) = ANY (SELECT lower(a) FROM unnest(g."aliases") AS a)
      ORDER BY (lower(g."key") = lower(token)) DESC
      LIMIT 1;
    IF found_key IS NULL THEN
      target := token;
    ELSIF found_merged IS NOT NULL THEN
      target := found_merged;
    ELSIF NOT found_active THEN
      CONTINUE;
    ELSE
      target := found_key;
    END IF;
    IF NOT (target = ANY (result)) THEN result := array_append(result, target); END IF;
  END LOOP;
  IF array_length(result, 1) IS NULL THEN RETURN NULL; END IF;
  RETURN array_to_string(result, ',');
END $$;

-- Antes de gravar: a obra sempre guarda os gêneros no vocabulário.
CREATE OR REPLACE FUNCTION "animehub_catalog_genres_before"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."genres" := "animehub_canonical_genres"(NEW."genres");
  RETURN NEW;
END $$;

-- Depois de gravar: o índice obra ↔ gênero acompanha; gênero desconhecido entra como não registrado (para revisar).
CREATE OR REPLACE FUNCTION "animehub_catalog_genres_after"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE token text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."genres" IS NOT DISTINCT FROM OLD."genres" THEN RETURN NULL; END IF;
  DELETE FROM "CatalogGenre" WHERE "catalogEntryId" = NEW."id";
  IF NEW."genres" IS NULL THEN RETURN NULL; END IF;
  FOREACH token IN ARRAY string_to_array(NEW."genres", ',') LOOP
    INSERT INTO "Genre" ("key", "label", "registered", "position") VALUES (token, token, false, 999) ON CONFLICT ("key") DO NOTHING;
    INSERT INTO "CatalogGenre" ("catalogEntryId", "genreKey") VALUES (NEW."id", token) ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TRIGGER "catalog_genres_before" BEFORE INSERT OR UPDATE OF "genres" ON "CatalogEntry" FOR EACH ROW EXECUTE FUNCTION "animehub_catalog_genres_before"();
CREATE TRIGGER "catalog_genres_after" AFTER INSERT OR UPDATE OF "genres" ON "CatalogEntry" FOR EACH ROW EXECUTE FUNCTION "animehub_catalog_genres_after"();

-- Backfill: regrava os gêneros (o gatilho normaliza e monta o índice; "" vira nulo).
UPDATE "CatalogEntry" SET "genres" = "genres" WHERE "genres" IS NOT NULL;
-- Força o índice também onde o texto já estava canônico (o gatilho "depois" pula quando nada mudou).
INSERT INTO "CatalogGenre" ("catalogEntryId", "genreKey")
SELECT c."id", btrim(t) FROM "CatalogEntry" c, unnest(string_to_array(c."genres", ',')) AS t
WHERE c."genres" IS NOT NULL AND btrim(t) <> '' AND EXISTS (SELECT 1 FROM "Genre" g WHERE g."key" = btrim(t))
ON CONFLICT DO NOTHING;

-- Sinopse em português: o que já existe é tradução automática, a não ser que o admin tenha protegido o campo.
UPDATE "CatalogEntry" SET "descriptionPtStatus" = CASE WHEN 'descriptionPt' = ANY ("manualFields") THEN 'MANUAL' ELSE 'AUTO' END
WHERE "descriptionPt" IS NOT NULL AND "descriptionPtStatus" IS NULL;
UPDATE "CatalogEntry" c SET "descriptionPtSource" = t."source"
FROM "SynopsisTranslation" t WHERE t."anilistId" = c."anilistId" AND t."lang" = 'pt' AND c."descriptionPtStatus" = 'AUTO' AND c."descriptionPtSource" IS NULL;

-- Pendências já resolvidas: sem a data real, fica a da última alteração (o tempo médio considera só as novas).
UPDATE "CurationIssue" SET "resolvedAt" = "updatedAt" WHERE "status" = 'RESOLVED' AND "resolvedAt" IS NULL;
