/**
 * ioredis singleton for socket-service.
 * Use for all read/write Redis operations.
 * REDIS_URL environment variable must be set.
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

redis.on('error', (err: Error) => {
  logger.error('Redis client error', { err: err.message });
});

redis.on('connect', () => {
  logger.info('Redis client connected', { url: redisUrl });
});
