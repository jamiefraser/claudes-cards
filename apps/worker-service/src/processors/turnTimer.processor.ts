/**
 * Turn Timer Processor — Unit 20
 *
 * When a player's turn timer expires, this processor publishes a bot activation
 * message to the 'bot:action:{roomId}' Redis channel.
 *
 * The socket-service BotController subscribes to this channel and activates
 * the bot for the timed-out player's seat.
 *
 * Per SPEC.md §20 Story 9.4 and Redis Key Schema §5.
 */

import type { Job } from 'bullmq';
import { redis } from '../redis/client.js';
import { logger } from '../utils/logger.js';

export interface TurnTimerJobPayload {
  /** The room where the timer expired. */
  roomId: string;
  /** The player whose turn it was. */
  playerId: string;
  /** The seat index of the player. */
  seatIndex: number;
}

/**
 * Process a turn timer expiry.
 * Publishes { type: 'activate', playerId, seatIndex } to bot:action:{roomId}.
 */
export async function processTurnTimer(job: Job<TurnTimerJobPayload>): Promise<void> {
  const { roomId, playerId, seatIndex } = job.data;

  logger.info('Turn timer expired — activating bot', { roomId, playerId, seatIndex });

  const channel = `bot:action:${roomId}`;
  const message = JSON.stringify({ type: 'activate', playerId, seatIndex });

  await redis.publish(channel, message);

  logger.info('Published bot activation to Redis channel', { channel });
}
