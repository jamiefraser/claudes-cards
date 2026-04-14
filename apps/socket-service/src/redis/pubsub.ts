/**
 * Separate ioredis connection for pub/sub subscriptions.
 * Redis requires a dedicated connection for subscribe mode.
 * REDIS_URL environment variable must be set.
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redisSub = new Redis(redisUrl, {
  lazyConnect: true,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

redisSub.on('error', (err: Error) => {
  logger.error('Redis pubsub error', { err: err.message });
});

redisSub.on('connect', () => {
  logger.info('Redis pubsub connected');
});
