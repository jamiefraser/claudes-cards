/**
 * Turn Timer Processor — Unit 20
 *
 * Two job shapes flow through this queue:
 *
 *   { type: 'activate', roomId, playerId, seatIndex }
 *     — the human's async turn timer expired; convert their seat to a bot.
 *       Publishes to `bot:action:{roomId}` so the socket-service subscriber
 *       invokes BotController.activateBot.
 *
 *   { type: 'execute',  roomId, playerId, scheduledForVersion }
 *     — an already-active bot is scheduled to take its turn after think-time.
 *       Publishes to `bot:action:{roomId}` so the socket-service subscriber
 *       invokes BotPlayer.executeAction. `scheduledForVersion` is forwarded so
 *       the executor can abort if the game has advanced past it.
 *
 * Jobs older than the 'activate' shape (no `type` field) are treated as
 * 'activate' for backwards compatibility with any queued jobs from a previous
 * deploy.
 *
 * Per SPEC.md §20 Story 9.4 and Redis Key Schema §5.
 */

import type { Job } from 'bullmq';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';

export interface TurnTimerActivateJob {
  type?: 'activate';
  roomId: string;
  playerId: string;
  seatIndex: number;
}

export interface TurnTimerExecuteJob {
  type: 'execute';
  roomId: string;
  playerId: string;
  scheduledForVersion: number;
}

export type TurnTimerJobPayload = TurnTimerActivateJob | TurnTimerExecuteJob;

export async function processTurnTimer(job: Job<TurnTimerJobPayload>): Promise<void> {
  const data = job.data;
  const channel = `bot:action:${data.roomId}`;

  if (data.type === 'execute') {
    const message = JSON.stringify({
      type: 'execute',
      playerId: data.playerId,
      scheduledForVersion: data.scheduledForVersion,
    });
    await redis.publish(channel, message);
    logger.info('Published bot execute to Redis channel', {
      channel,
      playerId: data.playerId,
      scheduledForVersion: data.scheduledForVersion,
    });
    return;
  }

  // Default: legacy 'activate' shape (seat takeover on async turn timeout).
  const seatIndex = (data as TurnTimerActivateJob).seatIndex ?? 0;
  logger.info('Turn timer expired — activating bot', {
    roomId: data.roomId,
    playerId: data.playerId,
    seatIndex,
  });
  const message = JSON.stringify({
    type: 'activate',
    playerId: data.playerId,
    seatIndex,
  });
  await redis.publish(channel, message);
  logger.info('Published bot activation to Redis channel', { channel });
}
