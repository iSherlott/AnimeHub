-- Atraso do streaming por obra (Epic 50).
ALTER TABLE "CatalogEntry" ADD COLUMN "streamingDelayMinutes" INTEGER;
ALTER TABLE "CatalogEntry" ADD COLUMN "streamingSite" TEXT;
