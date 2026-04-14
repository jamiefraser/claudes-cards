/**
 * Auth Service
 *
 * Business logic for auth-related API operations.
 */

import { prisma } from '../db/prisma';
import type { PlayerProfile } from '@shared/auth';

/**
 * Fetches the full player profile for the authenticated user.
 * Used by GET /api/v1/auth/me.
 */
export async function getMyProfile(playerId: string): Promise<PlayerProfile | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
    },
  });

  if (!player) return null;

  return {
    id: player.id,
    username: player.username,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    role: player.role as PlayerProfile['role'],
    createdAt: player.createdAt.toISOString(),
  };
}

/**
 * Fetches a player's public profile by ID.
 * Used by GET /api/v1/players/:id.
 */
export async function getPlayerProfile(id: string): Promise<PlayerProfile | null> {
  const player = await prisma.player.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
    },
  });

  if (!player) return null;

  return {
    id: player.id,
    username: player.username,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    role: player.role as PlayerProfile['role'],
    createdAt: player.createdAt.toISOString(),
  };
}

/**
 * Searches players by displayName (case-insensitive, partial match).
 * Used by GET /api/v1/players/search?q=.
 */
export async function searchPlayers(
  q: string,
  limit = 20,
): Promise<PlayerProfile[]> {
  const players = await prisma.player.findMany({
    where: {
      displayName: {
        contains: q,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
    },
    take: limit,
    orderBy: { displayName: 'asc' },
  });

  return players.map((p) => ({
    id: p.id,
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    role: p.role as PlayerProfile['role'],
    createdAt: p.createdAt.toISOString(),
  }));
}
