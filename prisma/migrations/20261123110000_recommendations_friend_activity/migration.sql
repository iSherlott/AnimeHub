-- Só adiciona: recomendar uma obra a um amigo e a atividade compartilhada com os amigos (vem desligada).
ALTER TABLE "User" ADD COLUMN "notifyRecommendations" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "shareActivity" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SocialNotification" ADD COLUMN "recommendationId" TEXT;

CREATE TABLE "WorkRecommendation" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "workKey" TEXT NOT NULL,
    "catalogEntryId" TEXT,
    "titleRomaji" TEXT NOT NULL,
    "titleEnglish" TEXT,
    "coverImage" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkRecommendation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkRecommendation_fromId_toId_workKey_key" ON "WorkRecommendation"("fromId", "toId", "workKey");
CREATE INDEX "WorkRecommendation_toId_createdAt_idx" ON "WorkRecommendation"("toId", "createdAt");
CREATE INDEX "WorkRecommendation_fromId_createdAt_idx" ON "WorkRecommendation"("fromId", "createdAt");
ALTER TABLE "WorkRecommendation" ADD CONSTRAINT "WorkRecommendation_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkRecommendation" ADD CONSTRAINT "WorkRecommendation_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FriendActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "workKey" TEXT NOT NULL,
    "href" TEXT,
    "titleRomaji" TEXT NOT NULL,
    "titleEnglish" TEXT,
    "coverImage" TEXT,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendActivity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FriendActivity_userId_workKey_kind_key" ON "FriendActivity"("userId", "workKey", "kind");
CREATE INDEX "FriendActivity_userId_createdAt_idx" ON "FriendActivity"("userId", "createdAt");
ALTER TABLE "FriendActivity" ADD CONSTRAINT "FriendActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
