-- AlterTable
ALTER TABLE "SocialNotification" ADD COLUMN     "relatedWorkKey" TEXT,
ADD COLUMN     "workKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyAnnouncements" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyMentions" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MutedTopic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutedTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPoll" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "closesAt" TIMESTAMP(3),

    CONSTRAINT "PostPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "PostPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPollVote" (
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostPollVote_pkey" PRIMARY KEY ("pollId","userId")
);

-- CreateTable
CREATE TABLE "SeasonCharacterAward" (
    "id" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "characterId" INTEGER NOT NULL,
    "workKey" TEXT,
    "favorites" INTEGER NOT NULL,
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeasonCharacterAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MutedTopic_userId_kind_key_key" ON "MutedTopic"("userId", "kind", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PostPoll_postId_key" ON "PostPoll"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostPollOption_pollId_position_key" ON "PostPollOption"("pollId", "position");

-- CreateIndex
CREATE INDEX "PostPollVote_optionId_idx" ON "PostPollVote"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonCharacterAward_season_seasonYear_key" ON "SeasonCharacterAward"("season", "seasonYear");

-- AddForeignKey
ALTER TABLE "MutedTopic" ADD CONSTRAINT "MutedTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPoll" ADD CONSTRAINT "PostPoll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPollOption" ADD CONSTRAINT "PostPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "PostPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPollVote" ADD CONSTRAINT "PostPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "PostPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPollVote" ADD CONSTRAINT "PostPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPollVote" ADD CONSTRAINT "PostPollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PostPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

