/**
 * BullMQ VAPID / Web Push notification queue.
 * Used by socket-service to enqueue push notifications for async turns.
 * Per SPEC.md §20 Story 10.6, CLAUDE.md rule 14.
 */

import { Queue } from 'bullmq';
import { redis } from '../redis/client';

export const vapidQueue = new Queue('vapid', {
  connection: redis,
});
