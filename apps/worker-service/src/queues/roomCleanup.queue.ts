/**
 * BullMQ queue for post-game room cleanup.
 *
 * Socket-service enqueues a delayed job when `engine.isGameOver()` flips
 * true; the processor on this side tears down Redis state + deletes the
 * Room row in Postgres. Using a durable queue (instead of setTimeout)
 * means the cleanup survives a pod restart during the grace window.
 */
import { Queue } from 'bullmq';
import { redis } from '../redis/client';

export const roomCleanupQueue = new Queue('roomCleanup', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 24 * 3600, count: 200 },
    removeOnFail:     { age: 7 * 24 * 3600, count: 100 },
  },
});

export interface RoomCleanupJob {
  roomId: string;
  /** For logging only. */
  reason: 'gameOver' | 'hostClosed' | 'timeout';
}
