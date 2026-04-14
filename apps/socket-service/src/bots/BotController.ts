/**
 * BotController
 *
 * Manages bot seat lifecycle per SPEC.md §9.7.
 * Maintains an in-memory cache backed by Redis HASH for fast isBotActive() checks.
 *
 * Redis keys (SPEC.md §5):
 *   bot:active:{roomId}              HASH  { playerId → botInstanceId }
 *   bot:queue:{roomId}:{playerId}    STRING "pending"  TTL: BOT_ACTION_MS
 */

import { randomUUID } from 'crypto';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';
import type { BotActivatedPayload, BotYieldedPayload } from '@card-platform/shared-types';
import type { Server } from 'socket.io';

/** Think time bounds (ms) — SPEC.md §9.3 */
const THINK_TIME_MIN_MS = 800;
const THINK_TIME_MAX_MS = 2500;

/**
 * Lazily get the Socket.io Server instance.
 * Uses dynamic require to avoid circular import at module evaluation time.
 * Returns null if not yet initialised (e.g. in unit tests).
 */
function tryGetIO(): Server | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../index') as { getIO: () => Server };
    return mod.getIO();
  } catch {
    return null;
  }
}

export class BotController {
  /**
   * In-memory cache: roomId → Set<playerId>
   * Hydrated from Redis HASH on startup; kept in sync on activate/yield.
   */
  private activeBots: Map<string, Set<string>> = new Map();

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Activate a bot for the given seat.
   * Sets bot:active HASH in Redis, updates cache, emits bot_activated + system chat.
   */
  async activateBot(roomId: string, playerId: string, seatIndex = 0): Promise<void> {
    const botInstanceId = randomUUID();

    await redis.hset(`bot:active:${roomId}`, playerId, botInstanceId);

    // Update in-memory cache
    if (!this.activeBots.has(roomId)) {
      this.activeBots.set(roomId, new Set());
    }
    this.activeBots.get(roomId)!.add(playerId);

    logger.info('Bot activated', { roomId, playerId, seatIndex, botInstanceId });

    // Emit bot_activated to the game room
    const payload: BotActivatedPayload = { playerId, seatIndex };
    const io = tryGetIO();
    if (io) {
      io.of('/game').to(roomId).emit('bot_activated', payload);
    } else {
      logger.warn('IO not available during bot activation (likely test context)');
    }
  }

  /**
   * Yield a bot seat back to the returning human player.
   * Removes from Redis HASH, deletes bot:queue, updates cache, emits bot_yielded.
   */
  async yieldBot(roomId: string, playerId: string, seatIndex = 0): Promise<void> {
    await redis.hdel(`bot:active:${roomId}`, playerId);
    await redis.del(`bot:queue:${roomId}:${playerId}`);

    // Update in-memory cache
    const room = this.activeBots.get(roomId);
    if (room) {
      room.delete(playerId);
      if (room.size === 0) {
        this.activeBots.delete(roomId);
      }
    }

    logger.info('Bot yielded', { roomId, playerId, seatIndex });

    const payload: BotYieldedPayload = { playerId, seatIndex };
    const io = tryGetIO();
    if (io) {
      io.of('/game').to(roomId).emit('bot_yielded', payload);
    } else {
      logger.warn('IO not available during bot yield (likely test context)');
    }
  }

  /**
   * Schedule a bot action after a random think time.
   * Sets bot:queue key in Redis with TTL, then fires executeAction after delay.
   * The BotPlayer will be imported lazily to avoid circular deps.
   */
  async scheduleAction(roomId: string, botPlayerId: string): Promise<void> {
    const thinkTimeMs =
      THINK_TIME_MIN_MS +
      Math.floor(Math.random() * (THINK_TIME_MAX_MS - THINK_TIME_MIN_MS + 1));

    const ttlSeconds = Math.ceil(thinkTimeMs / 1000) + 1; // extra second buffer

    await redis.set(
      `bot:queue:${roomId}:${botPlayerId}`,
      'pending',
      'EX',
      ttlSeconds,
    );

    logger.debug('Bot action scheduled', { roomId, botPlayerId, thinkTimeMs });

    setTimeout(() => {
      // Use globalThis._botPlayer to avoid circular dependency with BotPlayer
      const sharedBotPlayer = (globalThis as Record<string, unknown>)['_botPlayer'] as
        | { executeAction: (r: string, p: string) => Promise<void> }
        | undefined;

      if (sharedBotPlayer && typeof sharedBotPlayer.executeAction === 'function') {
        sharedBotPlayer.executeAction(roomId, botPlayerId).catch((err: Error) => {
          logger.error('Error in scheduled bot action', { roomId, botPlayerId, err: err.message });
        });
      } else {
        logger.warn('No shared BotPlayer instance found for scheduled action', { roomId, botPlayerId });
      }
    }, thinkTimeMs);
  }

  /**
   * Deactivate all bots in a room (called when game ends).
   * Fetches HGETALL, clears cache, deletes HASH.
   */
  async deactivateAll(roomId: string): Promise<void> {
    const allBots = await redis.hgetall(`bot:active:${roomId}`);
    if (allBots) {
      logger.info('Deactivating all bots for room', { roomId, count: Object.keys(allBots).length });
    }

    await redis.del(`bot:active:${roomId}`);
    this.activeBots.delete(roomId);

    logger.info('All bots deactivated for room', { roomId });
  }

  /**
   * Synchronous in-memory cache check.
   * Returns true if the given playerId is currently bot-controlled in the room.
   */
  isBotActive(roomId: string, playerId: string): boolean {
    return this.activeBots.get(roomId)?.has(playerId) ?? false;
  }

  /**
   * Hydrate in-memory cache from Redis on startup.
   * Call once during service initialisation.
   */
  async hydrateFromRedis(roomIds: string[]): Promise<void> {
    for (const roomId of roomIds) {
      const bots = await redis.hgetall(`bot:active:${roomId}`);
      if (bots && Object.keys(bots).length > 0) {
        this.activeBots.set(roomId, new Set(Object.keys(bots)));
        logger.info('BotController hydrated from Redis', { roomId, bots: Object.keys(bots) });
      }
    }
  }
}
