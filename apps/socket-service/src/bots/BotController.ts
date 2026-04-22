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
import { turnTimerQueue } from '../queues/turnTimer.queue';
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
    await redis.del(`bot:schedule:${roomId}:${playerId}`);

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
   *
   * Delivery guarantee: the delay is enforced by a BullMQ delayed job on the
   * `turnTimer` queue (Redis-backed, consumed by the worker-service processor,
   * which publishes to `bot:action:{roomId}`, which this service's subscriber
   * routes to BotPlayer.executeAction).
   *
   * Why not setTimeout? A setTimeout lives only in the current Node event loop
   * — if the socket-service pod restarts between the human move and the fire
   * time, the bot never plays and the game hangs waiting for the bot's turn.
   * The BullMQ job survives restarts and retries on failure.
   *
   * Idempotency: the jobId encodes roomId+playerId+stateVersion so two back-to-
   * back scheduleAction calls for the same turn collapse into one job.
   * `bot:queue:{roomId}:{playerId}` is still set as a cancel/stale marker that
   * BotPlayer checks before acting.
   */
  async scheduleAction(
    roomId: string,
    botPlayerId: string,
    scheduledForVersion?: number,
  ): Promise<void> {
    const thinkTimeMs =
      THINK_TIME_MIN_MS +
      Math.floor(Math.random() * (THINK_TIME_MAX_MS - THINK_TIME_MIN_MS + 1));

    // bot:queue STRING doubles as a "this bot-turn is still live" marker.
    // BotPlayer.executeAction DELs it after running; if the human rejoins
    // mid-flight, yieldBot() DELs it too. TTL covers the worst-case think
    // time + retry window.
    const ttlSeconds = Math.ceil(thinkTimeMs / 1000) + 30;
    await redis.set(
      `bot:queue:${roomId}:${botPlayerId}`,
      'pending',
      'EX',
      ttlSeconds,
    );

    const version = scheduledForVersion ?? Date.now();
    // BullMQ rejects ':' in custom job ids. botPlayerId already contains
    // colons (e.g. "bot:<uuid>"), so use '__' as our delimiter instead.
    const jobIdSafe = (s: string) => s.replace(/:/g, '_');
    const jobId = `bot-exec__${jobIdSafe(roomId)}__${jobIdSafe(botPlayerId)}__${version}`;

    // bot:schedule HASH carries the metadata BotSweeper needs to detect and
    // replay pub/sub messages that were missed (e.g. subscriber was briefly
    // disconnected at publish time). Same TTL as bot:queue so cleanup is
    // automatic if the bot session ends without a completion DEL.
    const scheduledAt = Date.now();
    await redis.hset(`bot:schedule:${roomId}:${botPlayerId}`, {
      scheduledAt: String(scheduledAt),
      thinkTimeMs: String(thinkTimeMs),
      scheduledForVersion: String(version),
      lastFireAt: '0',
    });
    await redis.expire(`bot:schedule:${roomId}:${botPlayerId}`, ttlSeconds);

    try {
      await turnTimerQueue.add(
        'bot-execute',
        {
          type: 'execute',
          roomId,
          playerId: botPlayerId,
          scheduledForVersion: version,
        },
        {
          jobId,
          delay: thinkTimeMs,
        },
      );
      logger.debug('Bot action enqueued', { roomId, botPlayerId, thinkTimeMs, jobId });
    } catch (err) {
      // Fall back to an in-process setTimeout so a Redis/BullMQ hiccup doesn't
      // freeze the game. Not durable across restarts, but better than hanging.
      logger.error('Bot action enqueue failed — falling back to setTimeout', {
        roomId,
        botPlayerId,
        err: (err as Error).message,
      });
      setTimeout(() => {
        const sharedBotPlayer = (globalThis as Record<string, unknown>)['_botPlayer'] as
          | { executeAction: (r: string, p: string) => Promise<void> }
          | undefined;
        sharedBotPlayer?.executeAction(roomId, botPlayerId).catch((err2: Error) => {
          logger.error('Fallback bot action failed', {
            roomId,
            botPlayerId,
            err: err2.message,
          });
        });
      }, thinkTimeMs);
    }
  }

  /**
   * Deactivate a single bot in a room. Called by BotPlayer's failure
   * circuit-breaker when the strategy + fallback have both been rejected
   * by the engine repeatedly — at that point letting the sweeper keep
   * rescheduling just burns cycles and leaves the table stuck on
   * "Thinking...". Removing the bot from bot:active tells the sweeper to
   * stop attempting; a human seat host can re-seat it if desired.
   */
  async deactivate(roomId: string, botPlayerId: string): Promise<void> {
    await redis.hdel(`bot:active:${roomId}`, botPlayerId);
    this.activeBots.get(roomId)?.delete(botPlayerId);
    await redis.del(`bot:queue:${roomId}:${botPlayerId}`);
    await redis.del(`bot:schedule:${roomId}:${botPlayerId}`);
    logger.info('Bot deactivated (single)', { roomId, botPlayerId });
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
