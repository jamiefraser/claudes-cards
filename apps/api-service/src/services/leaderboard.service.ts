/**
 * Leaderboard Service
 *
 * Business logic for leaderboard queries.
 * SPEC.md §18 Epic 7.
 */

import { prisma } from '../db/prisma';
import { Prisma, LeaderboardPeriod } from '@prisma/client';
import type { LeaderboardEntry } from '@shared/leaderboard';

interface LeaderboardResult {
  entries: LeaderboardEntry[];
  total: number;
}

interface LeaderboardOptions {
  gameId: string;
  period?: 'monthly' | 'all-time';
  month?: string;
  limit?: number;
  offset?: number;
  friendIds?: string[];
}

function mapPeriod(period: string): 'monthly' | 'all-time' {
  return period === 'monthly' ? 'monthly' : 'all-time';
}

export async function getLeaderboard(options: LeaderboardOptions): Promise<LeaderboardResult> {
  const { gameId, period = 'all-time', month, limit = 50, offset = 0, friendIds } = options;

  const prismaperiod: LeaderboardPeriod = period === 'all-time' ? LeaderboardPeriod.allTime : LeaderboardPeriod.monthly;

  let effectiveMonth: string | undefined;
  if (period === 'monthly') {
    if (month) {
      effectiveMonth = month;
    } else {
      const now = new Date();
      effectiveMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  const where: Prisma.LeaderboardEntryWhereInput = {
    gameId,
    period: prismaperiod,
    ...(effectiveMonth !== undefined ? { month: effectiveMonth } : {}),
    ...(friendIds && friendIds.length > 0 ? { playerId: { in: friendIds } } : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.leaderboardEntry.findMany({
      where,
      include: {
        player: { select: { displayName: true, avatarUrl: true } },
      },
      orderBy: [{ wins: 'desc' }, { losses: 'asc' }],
      skip: offset,
      take: limit,
    }),
    prisma.leaderboardEntry.count({ where }),
  ]);

  return {
    entries: entries.map((entry, index) => ({
      playerId: entry.playerId,
      displayName: entry.player.displayName,
      avatarUrl: entry.player.avatarUrl,
      gameId: entry.gameId,
      wins: entry.wins,
      losses: entry.losses,
      gamesPlayed: entry.wins + entry.losses + entry.draws,
      rank: offset + index + 1,
      period: mapPeriod(entry.period),
      updatedAt: entry.updatedAt.toISOString(),
    })),
    total,
  };
}

export async function getFriendsLeaderboard(
  playerId: string,
  gameId: string,
  options: Omit<LeaderboardOptions, 'gameId' | 'friendIds'> = {},
): Promise<LeaderboardResult> {
  // Get accepted friend IDs
  const relations = await prisma.friendRelation.findMany({
    where: {
      OR: [
        { requesterId: playerId, status: 'accepted' },
        { addresseeId: playerId, status: 'accepted' },
      ],
    },
    select: { requesterId: true, addresseeId: true },
  });

  const friendIds = [
    playerId,
    ...relations.map((r) => (r.requesterId === playerId ? r.addresseeId : r.requesterId)),
  ];

  return getLeaderboard({ ...options, gameId, friendIds });
}
