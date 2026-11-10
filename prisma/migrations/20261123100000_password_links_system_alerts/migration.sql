-- Só adiciona: link de uso único para definir a senha e os avisos do sistema para a administração.
CREATE TABLE "PasswordLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordLink_tokenHash_key" ON "PasswordLink"("tokenHash");
CREATE INDEX "PasswordLink_userId_idx" ON "PasswordLink"("userId");
ALTER TABLE "PasswordLink" ADD CONSTRAINT "PasswordLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SystemAlert" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "href" TEXT,
    "readBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SystemAlert_key_key" ON "SystemAlert"("key");
CREATE INDEX "SystemAlert_createdAt_idx" ON "SystemAlert"("createdAt");
