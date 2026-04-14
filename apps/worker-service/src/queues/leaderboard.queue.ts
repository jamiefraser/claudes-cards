/**
 * BullMQ leaderboard queue.
 * Used by the socket-service to enqueue game-end leaderboard updates.
 * Per SPEC.md §18.
 */

import { Queue } from 'bullmq';
import { redis } from '../redis/client.js';

export const leaderboardQueue = new Queue('leaderboard', {
  connection: redis,
});
