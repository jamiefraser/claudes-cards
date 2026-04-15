/**
 * BullMQ turn timer queue.
 * Used by socket-service to schedule turn timer jobs for async play.
 * Per SPEC.md §20 Story 9.4.
 */

import { Queue } from 'bullmq';
import { redis } from '../redis/client';

export const turnTimerQueue = new Queue('turnTimer', {
  connection: redis,
});
