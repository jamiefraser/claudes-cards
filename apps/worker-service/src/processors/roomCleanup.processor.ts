/**
 * Room cleanup processor.
 *
 * Fired after `engine.isGameOver()` returns true (socket-service enqueues
 * a delayed job via the `roomCleanup` BullMQ queue, typically with a 90-
 * second grace window so players see the WinCelebration overlay before the
 * room vanishes).
 *
 * Steps:
 *   1. DELETE the Room row in Postgres. game_results are FK-cascaded.
 *      `game_actions` rows are NOT cascaded (no FK; CLAUDE.md §15 marks
 *      that table append-only), so the historical action log survives.
 *   2. Flush all per-room Redis keys (state, locks, chat, bot schedule,
 *      queue markers, room meta/members/spectators).
 *
 * Safe to run repeatedly — each step is idempotent.
 */

import type { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';

export interface RoomCleanupJobPayload {
  roomId: string;
  reason?: 'gameOver' | 'hostClosed' | 'timeout';
}

const prisma = new PrismaClient();

const SIMPLE_KEYS = [
  'game:state',
  'game:lock',
  'game:actions',
  'replay:actions',
  'room:meta',
  'room:players',
  'room:spectators',
  'chat:history',
  'bot:active',
];

const PATTERN_KEYS = [
  // bot:queue:{roomId}:{playerId}, bot:schedule:{roomId}:{playerId}
  'bot:queue',
  'bot:schedule',
];

async function flushRedisForRoom(roomId: string): Promise<void> {
  // Direct deletes for fixed-shape keys
  const directKeys = SIMPLE_KEYS.map((prefix) => `${prefix}:${roomId}`);
  if (directKeys.length > 0) {
    await redis.del(...directKeys);
  }

  // Pattern-shaped keys (one per bot seat) — scan + delete
  for (const prefix of PATTERN_KEYS) {
    const pattern = `${prefix}:${roomId}:*`;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
      cursor = next;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  }
}

export async function processRoomCleanup(
  job: Job<RoomCleanupJobPayload>,
): Promise<void> {
  const { roomId, reason = 'gameOver' } = job.data;
  logger.info('Room cleanup starting', { roomId, reason, jobId: job.id });

  try {
    const deleted = await prisma.room.deleteMany({ where: { id: roomId } });
    logger.info('Room row deleted', { roomId, count: deleted.count });
  } catch (err) {
    // Not fatal — Redis cleanup still matters. Log and proceed.
    logger.error('Failed to delete Room row', {
      roomId,
      err: (err as Error).message,
    });
  }

  try {
    await flushRedisForRoom(roomId);
    logger.info('Room Redis keys flushed', { roomId });
  } catch (err) {
    logger.error('Failed to flush Redis for room', {
      roomId,
      err: (err as Error).message,
    });
    throw err; // let BullMQ retry the Redis step
  }
}
