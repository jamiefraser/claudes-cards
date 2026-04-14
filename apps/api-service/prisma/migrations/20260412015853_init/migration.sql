-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('waiting', 'playing', 'finished');

-- CreateEnum
CREATE TYPE "FriendStatus" AS ENUM ('pending', 'accepted', 'blocked');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('chat', 'dm', 'system');

-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('player', 'moderator', 'admin');

-- CreateEnum
CREATE TYPE "LeaderboardPeriod" AS ENUM ('monthly', 'allTime');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'ACTIONED', 'DISMISSED');

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "PlayerRole" NOT NULL DEFAULT 'player',
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "status" "RoomStatus" NOT NULL DEFAULT 'waiting',
    "asyncMode" BOOLEAN NOT NULL DEFAULT false,
    "turnTimerSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_results" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "winnerId" TEXT,
    "rankings" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_entries" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "period" "LeaderboardPeriod" NOT NULL,
    "month" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboard_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friend_relations" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friend_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "roomId" TEXT,
    "content" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_actions" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "actionJson" JSONB NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultVersion" INTEGER NOT NULL,

    CONSTRAINT "game_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mute_records" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "mutedByModId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mute_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_reports" (
    "id" TEXT NOT NULL,
    "reportedByPlayerId" TEXT NOT NULL,
    "reportedPlayerId" TEXT NOT NULL,
    "messageId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionedAt" TIMESTAMP(3),
    "actionedByModId" TEXT,

    CONSTRAINT "moderation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_audit_log" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "targetPlayerId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_catalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "minPlayers" INTEGER NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "supportsAsync" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "game_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_username_key" ON "players"("username");

-- CreateIndex
CREATE INDEX "leaderboard_entries_gameId_period_month_idx" ON "leaderboard_entries"("gameId", "period", "month");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_entries_playerId_gameId_period_month_key" ON "leaderboard_entries"("playerId", "gameId", "period", "month");

-- CreateIndex
CREATE UNIQUE INDEX "friend_relations_requesterId_addresseeId_key" ON "friend_relations"("requesterId", "addresseeId");

-- CreateIndex
CREATE INDEX "messages_roomId_createdAt_idx" ON "messages"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_senderId_recipientId_idx" ON "messages"("senderId", "recipientId");

-- CreateIndex
CREATE INDEX "game_actions_roomId_appliedAt_idx" ON "game_actions"("roomId", "appliedAt");

-- CreateIndex
CREATE INDEX "mute_records_playerId_idx" ON "mute_records"("playerId");

-- CreateIndex
CREATE INDEX "moderation_reports_reportedPlayerId_createdAt_idx" ON "moderation_reports"("reportedPlayerId", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_reports_status_createdAt_idx" ON "moderation_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_audit_log_targetPlayerId_createdAt_idx" ON "moderation_audit_log"("targetPlayerId", "createdAt");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_results" ADD CONSTRAINT "game_results_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_relations" ADD CONSTRAINT "friend_relations_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_relations" ADD CONSTRAINT "friend_relations_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mute_records" ADD CONSTRAINT "mute_records_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
