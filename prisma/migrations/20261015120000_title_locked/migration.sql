-- AlterTable
ALTER TABLE "CatalogEntry" ADD COLUMN     "titleLocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Production" ADD COLUMN     "titleLocked" BOOLEAN NOT NULL DEFAULT false;
