/**
 * Redis client singleton.
 * Used throughout api-service for presence checks and caching.
 * SPEC.md §5 — Redis Key Schema.
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger';

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,
  enableOfflineQueue: false,
});

redis.on('error', (err) => {
  logger.error('Redis client error', { err: err.message });
});

redis.on('connect', () => {
  logger.info('Redis client connected');
});
