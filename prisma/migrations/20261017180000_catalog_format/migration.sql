-- AlterTable
ALTER TABLE "CatalogEntry" ADD COLUMN     "format" TEXT;

-- CreateIndex
CREATE INDEX "CatalogEntry_format_idx" ON "CatalogEntry"("format");
