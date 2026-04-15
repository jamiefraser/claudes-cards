/**
 * ioredis singleton for worker-service.
 * Per SPEC.md §5 — Redis Key Schema.
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger';

// BullMQ requires maxRetriesPerRequest: null and enableReadyCheck: false
// on the connection used by Worker instances.
export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on('error', (err: Error) => {
  logger.error('Redis client error', { err: err.message });
});

redis.on('connect', () => {
  logger.info('Redis client connected');
});
