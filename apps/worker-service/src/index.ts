/**
 * Worker Service — Main Entry Point
 *
 * Registers BullMQ processors for:
 *   - leaderboard: upserts LeaderboardEntry rows after game-end
 *   - turnTimer:   publishes bot:action:{roomId} on turn expiry
 *   - vapid:       sends Web Push notifications for async turns
 *
 * Also starts a minimal HTTP server for K8s health probes.
 * Per SPEC.md §20, CLAUDE.md rule 7.
 */

import express from 'express';
import { Worker } from 'bullmq';
import { redis } from './redis/client';
import { logger } from './utils/logger';
import { processTurnTimer } from './processors/turnTimer.processor';
import { processLeaderboard } from './processors/leaderboard.processor';
import { processVapid } from './processors/vapid.processor';
import { processRoomCleanup } from './processors/roomCleanup.processor';

const WORKER_PORT = Number(process.env.WORKER_PORT ?? 3003);

// ---------------------------------------------------------------------------
// BullMQ Workers
// ---------------------------------------------------------------------------

const leaderboardWorker = new Worker('leaderboard', processLeaderboard, {
  connection: redis,
});

const turnTimerWorker = new Worker('turnTimer', processTurnTimer, {
  connection: redis,
});

const vapidWorker = new Worker('vapid', processVapid, {
  connection: redis,
});

const roomCleanupWorker = new Worker('roomCleanup', processRoomCleanup, {
  connection: redis,
});

const workers = [leaderboardWorker, turnTimerWorker, vapidWorker, roomCleanupWorker];

workers.forEach((worker) => {
  worker.on('completed', (job) => {
    logger.info('Job completed', { queue: worker.name, jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', { queue: worker.name, jobId: job?.id, err: err.message });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { queue: worker.name, err: err.message });
  });
});

// ---------------------------------------------------------------------------
// Health HTTP Server (for K8s liveness/readiness probes)
// Per Unit 19 devops requirements: GET /health → 200
// ---------------------------------------------------------------------------

const app = express();

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    queues: ['leaderboard', 'turnTimer', 'vapid', 'roomCleanup'],
  });
});

app.get('/health/ready', async (_req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'ready' });
  } catch (err) {
    const error = err as Error;
    logger.error('Health readiness check failed', { err: error.message });
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  try {
    await redis.connect();
  } catch (err) {
    // lazyConnect — connect() may reject if already connected; that's fine
    const error = err as Error;
    if (!error.message.includes('already')) {
      logger.warn('Redis connect warning', { err: error.message });
    }
  }

  app.listen(WORKER_PORT, () => {
    logger.info('Worker service started', { port: WORKER_PORT });
  });
};

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

const shutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal} — shutting down gracefully`);

  await Promise.all(workers.map((w) => w.close()));
  await redis.disconnect();

  logger.info('Worker service shut down cleanly');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  logger.error('Worker service failed to start', { err: (err as Error).message });
  process.exit(1);
});
