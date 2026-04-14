/**
 * Leaderboard Processor — Unit 20
 *
 * Processes game-end results and upserts LeaderboardEntry rows in Prisma.
 *
 * Rules:
 * - Entries where isBot: true are SKIPPED (CLAUDE.md rule 11, SPEC.md §18).
 * - Each human player gets two upserts: period='monthly' and period='allTime'.
 * - Monthly period uses the current month in 'YYYY-MM' format.
 * - After all upserts, publishes 'leaderboard:updated:{gameId}' to Redis.
 *
 * Per SPEC.md §18, CLAUDE.md rule 11.
 */

import type { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redis } from '../redis/client.js';
import { logger } from '../utils/logger.js';
import type { PlayerRanking } from '@shared/gameEngine.js';

export interface LeaderboardJobPayload {
  gameId: string;
  roomId?: string;
  gameResult: {
    rankings: PlayerRanking[];
  };
}

const prisma = new PrismaClient();

/**
 * Process a game-end leaderboard update.
 * Upserts monthly and allTime entries for every human (non-bot) participant.
 */
export async function processLeaderboard(job: Job<LeaderboardJobPayload>): Promise<void> {
  const { gameId, gameResult } = job.data;
  const { rankings } = gameResult;

  // CLAUDE.md rule 11: skip all bot entries
  const humanRankings = rankings.filter((r) => !r.isBot);

  if (humanRankings.length === 0) {
    logger.warn('All participants were bots — no leaderboard entries created (abandoned game)', {
      gameId,
    });
    return;
  }

  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  for (const ranking of humanRankings) {
    const isWinner = ranking.rank === 1;
    const winsIncrement = isWinner ? 1 : 0;
    const lossesIncrement = isWinner ? 0 : 1;

    // Upsert for allTime period
    await prisma.leaderboardEntry.upsert({
      where: {
        playerId_gameId_period_month: {
          playerId: ranking.playerId,
          gameId,
          period: 'allTime',
          month: null as unknown as string,
        },
      },
      create: {
        playerId: ranking.playerId,
        gameId,
        period: 'allTime',
        month: null as unknown as string,
        wins: winsIncrement,
        losses: lossesIncrement,
        draws: 0,
        points: ranking.score,
      },
      update: {
        wins: { increment: winsIncrement },
        losses: { increment: lossesIncrement },
        points: { increment: ranking.score },
      },
    });

    // Upsert for monthly period
    await prisma.leaderboardEntry.upsert({
      where: {
        playerId_gameId_period_month: {
          playerId: ranking.playerId,
          gameId,
          period: 'monthly',
          month: currentMonth,
        },
      },
      create: {
        playerId: ranking.playerId,
        gameId,
        period: 'monthly',
        month: currentMonth,
        wins: winsIncrement,
        losses: lossesIncrement,
        draws: 0,
        points: ranking.score,
      },
      update: {
        wins: { increment: winsIncrement },
        losses: { increment: lossesIncrement },
        points: { increment: ranking.score },
      },
    });

    logger.debug('Upserted leaderboard entries', { playerId: ranking.playerId, gameId });
  }

  // Publish leaderboard update event per SPEC.md §5 Redis Key Schema
  await redis.publish(
    `leaderboard:updated:${gameId}`,
    JSON.stringify({ gameId, updatedAt: new Date().toISOString() }),
  );

  logger.info('Leaderboard updated', { gameId, humanCount: humanRankings.length });
}
