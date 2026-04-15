/**
 * BullMQ turnTimer queue — producer side (socket-service).
 *
 * Used to schedule durable bot actions. A delayed job survives a
 * socket-service pod restart; the worker-service processor picks it up and
 * publishes to `bot:action:{roomId}`, where the socket-service subscriber
 * dispatches to BotPlayer.executeAction.
 *
 * Paired with the producer in apps/worker-service/src/queues/turnTimer.queue.ts
 * and the processor at apps/worker-service/src/processors/turnTimer.processor.ts.
 */

import { Queue } from 'bullmq';
import { redis } from '../redis/client';

export const turnTimerQueue = new Queue('turnTimer', {
  connection: redis,
  defaultJobOptions: {
    // Survive transient Redis/worker hiccups. Exponential back-off so a
    // persistently-failing job doesn't hammer the system.
    attempts: 3,
    backoff: { type: 'exponential', delay: 500 },
    // Keep the ring small; we only need history for debugging.
    removeOnComplete: { age: 3600, count: 500 },
    removeOnFail: { age: 24 * 3600, count: 200 },
  },
});

export interface BotExecuteJob {
  type: 'execute';
  roomId: string;
  playerId: string;
  /** Guards idempotency — cancel if state advances past this version. */
  scheduledForVersion: number;
}

export interface BotActivateJob {
  type: 'activate';
  roomId: string;
  playerId: string;
  seatIndex: number;
}

export type TurnTimerJob = BotExecuteJob | BotActivateJob;
