/**
 * Leaderboard Processor Tests — Unit 20
 *
 * Verifies:
 * - Bot entries (isBot: true) are excluded from leaderboard upserts
 * - Human player entries are upserted for both monthly and allTime periods
 * - Redis leaderboard:updated:{gameId} is published after upsert
 * - Abandoned games (all bots) create no leaderboard entries
 *
 * Per SPEC.md §18, CLAUDE.md rule 11.
 */

import type { Job } from 'bullmq';
import type { LeaderboardJobPayload } from '../src/processors/leaderboard.processor';

// Mock ioredis
const mockPublish = jest.fn().mockResolvedValue(1);
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    publish: mockPublish,
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    status: 'ready',
  }));
});

// Mock Prisma
const mockUpsert = jest.fn().mockResolvedValue({});
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    leaderboardEntry: {
      upsert: mockUpsert,
    },
    $disconnect: jest.fn(),
  })),
}));

// Mock winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}));

import { processLeaderboard } from '../src/processors/leaderboard.processor';

describe('processLeaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips bot entries (isBot: true) and only upserts human entries', async () => {
    const payload: LeaderboardJobPayload = {
      gameId: 'cribbage',
      roomId: 'room-123',
      gameResult: {
        rankings: [
          { playerId: 'human-1', displayName: 'Alice', rank: 1, score: 100, isBot: false },
          { playerId: 'bot-1', displayName: 'Bot#1', rank: 2, score: 50, isBot: true },
          { playerId: 'human-2', displayName: 'Bob', rank: 3, score: 25, isBot: false },
        ],
      },
    };

    const mockJob = { data: payload } as Job<LeaderboardJobPayload>;
    await processLeaderboard(mockJob);

    // Should upsert 2 humans × 2 periods = 4 upsert calls
    expect(mockUpsert).toHaveBeenCalledTimes(4);

    // Verify no bot upsert was made
    const upsertCalls = mockUpsert.mock.calls;
    upsertCalls.forEach((call) => {
      const whereClause = call[0].where;
      expect(whereClause.playerId_gameId_period_month).not.toMatchObject({
        playerId: 'bot-1',
      });
    });
  });

  it('upserts entries for both monthly and allTime periods', async () => {
    const payload: LeaderboardJobPayload = {
      gameId: 'cribbage',
      gameResult: {
        rankings: [
          { playerId: 'human-1', displayName: 'Alice', rank: 1, score: 100, isBot: false },
        ],
      },
    };

    const mockJob = { data: payload } as Job<LeaderboardJobPayload>;
    await processLeaderboard(mockJob);

    // 1 human × 2 periods = 2 upsert calls
    expect(mockUpsert).toHaveBeenCalledTimes(2);

    const periods = mockUpsert.mock.calls.map(
      (call) => call[0].where.playerId_gameId_period_month.period,
    );
    expect(periods).toContain('monthly');
    expect(periods).toContain('allTime');
  });

  it('publishes leaderboard:updated:{gameId} to Redis after upsert', async () => {
    const payload: LeaderboardJobPayload = {
      gameId: 'cribbage',
      gameResult: {
        rankings: [
          { playerId: 'human-1', displayName: 'Alice', rank: 1, score: 100, isBot: false },
        ],
      },
    };

    const mockJob = { data: payload } as Job<LeaderboardJobPayload>;
    await processLeaderboard(mockJob);

    expect(mockPublish).toHaveBeenCalledWith(
      'leaderboard:updated:cribbage',
      expect.any(String),
    );
  });

  it('creates no leaderboard entries when all participants are bots (abandoned game)', async () => {
    const payload: LeaderboardJobPayload = {
      gameId: 'cribbage',
      gameResult: {
        rankings: [
          { playerId: 'bot-1', displayName: 'Bot#1', rank: 1, score: 100, isBot: true },
          { playerId: 'bot-2', displayName: 'Bot#2', rank: 2, score: 50, isBot: true },
        ],
      },
    };

    const mockJob = { data: payload } as Job<LeaderboardJobPayload>;
    await processLeaderboard(mockJob);

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('updates wins for rank=1 player and losses for lower ranks', async () => {
    const payload: LeaderboardJobPayload = {
      gameId: 'cribbage',
      gameResult: {
        rankings: [
          { playerId: 'human-1', displayName: 'Alice', rank: 1, score: 100, isBot: false },
          { playerId: 'human-2', displayName: 'Bob', rank: 2, score: 50, isBot: false },
        ],
      },
    };

    const mockJob = { data: payload } as Job<LeaderboardJobPayload>;
    await processLeaderboard(mockJob);

    // Find the upsert call for human-1 (winner) allTime period
    const winnerCalls = mockUpsert.mock.calls.filter(
      (call) =>
        call[0].where.playerId_gameId_period_month.playerId === 'human-1' &&
        call[0].where.playerId_gameId_period_month.period === 'allTime',
    );
    expect(winnerCalls.length).toBe(1);
    expect(winnerCalls[0][0].update.wins).toEqual({ increment: 1 });
    expect(winnerCalls[0][0].update.losses).toEqual({ increment: 0 });

    // Find the upsert call for human-2 (loser) allTime period
    const loserCalls = mockUpsert.mock.calls.filter(
      (call) =>
        call[0].where.playerId_gameId_period_month.playerId === 'human-2' &&
        call[0].where.playerId_gameId_period_month.period === 'allTime',
    );
    expect(loserCalls.length).toBe(1);
    expect(loserCalls[0][0].update.wins).toEqual({ increment: 0 });
    expect(loserCalls[0][0].update.losses).toEqual({ increment: 1 });
  });
});
