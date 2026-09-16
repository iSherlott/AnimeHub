-- Post.imageUrl (String?) -> Post.imageUrls (String[])
-- Escrita à mão (não a migração gerada automaticamente pelo `prisma
-- migrate dev`, que dropraria a coluna sem preservar dado) para migrar
-- o valor já existente de cada post pro novo array em vez de perdê-lo.
ALTER TABLE "Post" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT '{}';
UPDATE "Post" SET "imageUrls" = ARRAY["imageUrl"] WHERE "imageUrl" IS NOT NULL;
ALTER TABLE "Post" DROP COLUMN "imageUrl";

-- Citação (Epic 25) — auto-relação opcional.
ALTER TABLE "Post" ADD COLUMN "quotedPostId" TEXT;
ALTER TABLE "Post" ADD CONSTRAINT "Post_quotedPostId_fkey"
  FOREIGN KEY ("quotedPostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Repost (Epic 25) — auto-relação opcional, único por (userId, repostOfId)
-- (Postgres trata múltiplos NULL como não-colidentes, então isso só
-- impede a mesma pessoa repostar o mesmo post 2x, sem afetar posts
-- normais com repostOfId nulo).
ALTER TABLE "Post" ADD COLUMN "repostOfId" TEXT;
ALTER TABLE "Post" ADD CONSTRAINT "Post_repostOfId_fkey"
  FOREIGN KEY ("repostOfId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Post_userId_repostOfId_key" ON "Post"("userId", "repostOfId");
