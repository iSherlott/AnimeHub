-- Só adiciona (10/11/2026): reação, nota e diário por episódio; bolão da temporada; anime da semana; tier list; agenda
-- de eventos; aberturas e encerramentos (AnimeThemes); personagens, dubladores e personagens favoritos.
-- AlterTable
ALTER TABLE "SocialNotification" ADD COLUMN     "animeEventId" TEXT;

-- CreateTable
CREATE TABLE "EpisodeReaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workKey" TEXT NOT NULL,
    "episode" INTEGER NOT NULL,
    "emoji" TEXT,
    "rating" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpisodeReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonPool" (
    "id" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "picksPerUser" INTEGER NOT NULL DEFAULT 5,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonPoolPick" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workKey" TEXT NOT NULL,
    "titleRomaji" TEXT NOT NULL,
    "coverImage" TEXT,
    "points" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonPoolPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyVote" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "winnerKey" TEXT,
    "postId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyVoteOption" (
    "id" TEXT NOT NULL,
    "voteId" TEXT NOT NULL,
    "workKey" TEXT NOT NULL,
    "titleRomaji" TEXT NOT NULL,
    "coverImage" TEXT,
    "episode" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WeeklyVoteOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyVoteBallot" (
    "id" TEXT NOT NULL,
    "voteId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyVoteBallot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "tiersJson" TEXT NOT NULL,
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TierList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimeEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'OUTRO',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "place" TEXT,
    "url" TEXT,
    "partner" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AnimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimeEventRsvp" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimeEventRsvp_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "WorkTheme" (
    "id" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "slug" TEXT NOT NULL,
    "title" TEXT,
    "artists" TEXT,
    "episodes" TEXT,
    "videoUrl" TEXT,
    "sourceUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkThemeLike" (
    "themeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkThemeLike_pkey" PRIMARY KEY ("themeId","userId")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nativeName" TEXT,
    "image" TEXT,
    "description" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceActor" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nativeName" TEXT,
    "image" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceActor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkCharacter" (
    "id" TEXT NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "characterId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "voiceActorId" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteCharacter" (
    "userId" TEXT NOT NULL,
    "characterId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteCharacter_pkey" PRIMARY KEY ("userId","characterId")
);

-- CreateIndex
CREATE INDEX "EpisodeReaction_workKey_episode_idx" ON "EpisodeReaction"("workKey", "episode");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeReaction_userId_workKey_episode_key" ON "EpisodeReaction"("userId", "workKey", "episode");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonPool_season_seasonYear_key" ON "SeasonPool"("season", "seasonYear");

-- CreateIndex
CREATE INDEX "SeasonPoolPick_poolId_idx" ON "SeasonPoolPick"("poolId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonPoolPick_poolId_userId_workKey_key" ON "SeasonPoolPick"("poolId", "userId", "workKey");

-- CreateIndex
CREATE INDEX "WeeklyVote_status_createdAt_idx" ON "WeeklyVote"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyVoteOption_voteId_workKey_key" ON "WeeklyVoteOption"("voteId", "workKey");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyVoteBallot_voteId_userId_key" ON "WeeklyVoteBallot"("voteId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TierList_userId_season_seasonYear_key" ON "TierList"("userId", "season", "seasonYear");

-- CreateIndex
CREATE INDEX "AnimeEvent_startsAt_idx" ON "AnimeEvent"("startsAt");

-- CreateIndex
CREATE INDEX "AnimeEventRsvp_userId_idx" ON "AnimeEventRsvp"("userId");

-- CreateIndex
CREATE INDEX "WorkTheme_anilistId_idx" ON "WorkTheme"("anilistId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTheme_anilistId_slug_key" ON "WorkTheme"("anilistId", "slug");

-- CreateIndex
CREATE INDEX "WorkCharacter_characterId_idx" ON "WorkCharacter"("characterId");

-- CreateIndex
CREATE INDEX "WorkCharacter_voiceActorId_idx" ON "WorkCharacter"("voiceActorId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCharacter_anilistId_characterId_key" ON "WorkCharacter"("anilistId", "characterId");

-- AddForeignKey
ALTER TABLE "EpisodeReaction" ADD CONSTRAINT "EpisodeReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonPoolPick" ADD CONSTRAINT "SeasonPoolPick_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "SeasonPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonPoolPick" ADD CONSTRAINT "SeasonPoolPick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyVoteOption" ADD CONSTRAINT "WeeklyVoteOption_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "WeeklyVote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyVoteBallot" ADD CONSTRAINT "WeeklyVoteBallot_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "WeeklyVote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyVoteBallot" ADD CONSTRAINT "WeeklyVoteBallot_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "WeeklyVoteOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyVoteBallot" ADD CONSTRAINT "WeeklyVoteBallot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierList" ADD CONSTRAINT "TierList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeEventRsvp" ADD CONSTRAINT "AnimeEventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "AnimeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimeEventRsvp" ADD CONSTRAINT "AnimeEventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkThemeLike" ADD CONSTRAINT "WorkThemeLike_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "WorkTheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkThemeLike" ADD CONSTRAINT "WorkThemeLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCharacter" ADD CONSTRAINT "WorkCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCharacter" ADD CONSTRAINT "WorkCharacter_voiceActorId_fkey" FOREIGN KEY ("voiceActorId") REFERENCES "VoiceActor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteCharacter" ADD CONSTRAINT "FavoriteCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteCharacter" ADD CONSTRAINT "FavoriteCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

