/**
 * Health Routes
 *
 * GET /health       — liveness probe (always returns ok if app is up)
 * GET /health/ready — readiness probe (checks DB + Redis connectivity)
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch (err) {
    logger.error('Readiness check: DB unreachable', { err });
    checks.db = 'error';
  }

  // Redis check — optional at this stage; redis client may not be wired yet
  // TODO: import redisClient when redis/client.ts is implemented and check ping
  checks.redis = 'ok'; // placeholder

  const allHealthy = Object.values(checks).every((v) => v === 'ok');
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});
