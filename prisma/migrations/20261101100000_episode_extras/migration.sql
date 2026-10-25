-- Extras do AniDB (especiais, aberturas/encerramentos, trailers, paródias, outros), fora da sequência regular. Só acrescenta.

-- CreateTable
CREATE TABLE "EpisodeExtra" (
    "id" TEXT NOT NULL,
    "catalogEntryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "titleEn" TEXT,
    "titleJa" TEXT,
    "synopsis" TEXT,
    "airDate" DATE,
    "source" TEXT NOT NULL DEFAULT 'anidb',
    "manualFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EpisodeExtra_catalogEntryId_kind_idx" ON "EpisodeExtra"("catalogEntryId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeExtra_catalogEntryId_code_key" ON "EpisodeExtra"("catalogEntryId", "code");

-- AddForeignKey
ALTER TABLE "EpisodeExtra" ADD CONSTRAINT "EpisodeExtra_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

