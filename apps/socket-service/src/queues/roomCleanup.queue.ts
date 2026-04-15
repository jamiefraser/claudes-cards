/**
 * BullMQ roomCleanup queue — producer side (socket-service).
 *
 * Enqueue a delayed job when `engine.isGameOver()` returns true so the
 * worker-service tears down the room after the celebration grace window.
 * See apps/worker-service/src/processors/roomCleanup.processor.ts.
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
  reason: 'gameOver' | 'hostClosed' | 'timeout';
}

/**
 * Grace period from game-over to room deletion. Matches the WinCelebration
 * overlay's comfortable read time; tune together if you change either.
 */
export const ROOM_CLEANUP_DELAY_MS = 90_000;

/**
 * Idempotent: the jobId is scoped to (roomId, reason), so repeated
 * post-action calls during the same hand collapse into a single scheduled
 * delete.
 */
export async function scheduleRoomCleanup(
  roomId: string,
  reason: RoomCleanupJob['reason'] = 'gameOver',
  delayMs: number = ROOM_CLEANUP_DELAY_MS,
): Promise<void> {
  await roomCleanupQueue.add(
    'cleanup',
    { roomId, reason },
    { jobId: `cleanup:${roomId}:${reason}`, delay: delayMs },
  );
}
