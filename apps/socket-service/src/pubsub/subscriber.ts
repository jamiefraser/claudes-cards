/**
 * PubSub Subscriber
 *
 * Subscribes to Redis pub/sub channels and routes messages to the appropriate
 * Socket.io namespace or BotController.
 *
 * Channels (SPEC.md §5):
 *   bot:action:{roomId}          → BotController.activateBot
 *   room:event:{roomId}          → emit to /lobby
 *   leaderboard:updated:{gameId} → emit leaderboard_updated to /lobby
 */

import type { Server } from 'socket.io';
import { redisSub } from '../redis/pubsub';
import { logger } from '../utils/logger';
import type { BotController } from '../bots/BotController';
import type { BotPlayer } from '../bots/BotPlayer';

/**
 * Wire up pub/sub subscriber.
 * Uses psubscribe for pattern matching.
 */
export function setupPubSubSubscriber(
  io: Server,
  botController: BotController,
  botPlayer: BotPlayer | null = null,
): void {
  // Pattern subscribe covers all three channel patterns
  const patterns = ['bot:action:*', 'room:event:*', 'leaderboard:updated:*'];

  for (const pattern of patterns) {
    (redisSub as import('ioredis').Redis).psubscribe(pattern, (err) => {
      if (err) {
        logger.error('Failed to psubscribe', { pattern, err: String(err) });
      } else {
        logger.info('PubSub subscribed', { pattern });
      }
    });
  }

  (redisSub as import('ioredis').Redis).on(
    'pmessage',
    (pattern: string, channel: string, message: string) => {
      try {
        handlePubSubMessage(io, botController, botPlayer, pattern, channel, message);
      } catch (err) {
        logger.error('PubSub message handler error', { pattern, channel, err: String(err) });
      }
    },
  );
}

function handlePubSubMessage(
  io: Server,
  botController: BotController,
  botPlayer: BotPlayer | null,
  pattern: string,
  channel: string,
  message: string,
): void {
  if (pattern === 'bot:action:*') {
    // channel = "bot:action:{roomId}"
    const roomId = channel.replace('bot:action:', '');
    let parsed: {
      type?: string;
      playerId?: string;
      seatIndex?: number;
      scheduledForVersion?: number;
    };
    try {
      parsed = JSON.parse(message);
    } catch {
      logger.error('Invalid JSON in bot:action message', { channel, message });
      return;
    }
    if (!parsed.playerId) return;

    const action = parsed.type ?? 'activate';
    if (action === 'activate') {
      botController
        .activateBot(roomId, parsed.playerId, parsed.seatIndex ?? 0)
        .catch((err: Error) => {
          logger.error('BotController.activateBot failed from pubsub', { roomId, err: err.message });
        });
    } else if (action === 'execute') {
      // Durable bot-turn delivery (replaces in-process setTimeout).
      // If botPlayer wasn't wired in (e.g. test harness), fall back to the
      // globalThis._botPlayer shim for backwards compat.
      const runner =
        botPlayer ??
        (((globalThis as Record<string, unknown>)['_botPlayer'] as BotPlayer | undefined) ??
          null);
      if (!runner) {
        logger.warn('bot:action execute received but no BotPlayer is wired', {
          roomId,
          playerId: parsed.playerId,
        });
        return;
      }
      runner.executeAction(roomId, parsed.playerId, parsed.scheduledForVersion).catch((err: Error) => {
        logger.error('BotPlayer.executeAction failed from pubsub', {
          roomId,
          playerId: parsed.playerId,
          err: err.message,
        });
      });
    } else if (action === 'yield') {
      botController.yieldBot(roomId, parsed.playerId).catch((err: Error) => {
        logger.error('BotController.yieldBot failed from pubsub', { roomId, err: err.message });
      });
    }
    return;
  }

  if (pattern === 'room:event:*') {
    // channel = "room:event:{roomId}"
    const roomId = channel.replace('room:event:', '');
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      logger.error('Invalid JSON in room:event message', { channel, message });
      return;
    }
    // Forward event to /lobby room
    io.of('/lobby').to(`room:${roomId}`).emit('room_event', parsed);
    return;
  }

  if (pattern === 'leaderboard:updated:*') {
    // channel = "leaderboard:updated:{gameId}"
    const gameId = channel.replace('leaderboard:updated:', '');
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      logger.error('Invalid JSON in leaderboard:updated message', { channel, message });
      return;
    }
    io.of('/lobby').emit('leaderboard_updated', { gameId, ...(parsed as object) });
    return;
  }

  logger.warn('Unhandled pubsub pattern', { pattern, channel });
}
