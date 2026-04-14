/**
 * Dev Routes — AUTH_MODE=dev only
 *
 * These routes must never be reachable in production builds.
 * They are registered in index.ts only when AUTH_MODE=dev.
 *
 * POST /api/v1/dev/token
 *   Body: { username: string }
 *   Looks up the player in DB and returns a signed HS256 JWT.
 *   Used by Playwright tests to obtain auth tokens (SPEC.md §8).
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';
import { DevTokenPayload } from '@shared/auth';

export const devRouter = Router();

devRouter.post('/token', async (req: Request, res: Response): Promise<void> => {
  const { username } = req.body as { username?: string };

  if (!username || typeof username !== 'string' || username.trim() === '') {
    res.status(400).json({ error: 'username is required' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error('JWT_SECRET not set — cannot issue dev token');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    const player = await prisma.player.findUnique({
      where: { username: username.trim() },
      select: { id: true, username: true, displayName: true, role: true },
    });

    if (!player) {
      res.status(404).json({ error: `Player '${username}' not found` });
      return;
    }

    const payload: Omit<DevTokenPayload, 'iat' | 'exp'> = {
      sub: player.id,
      username: player.username,
      displayName: player.displayName,
      role: player.role as DevTokenPayload['role'],
    };

    const token = jwt.sign(payload, secret, { expiresIn: '8h' });

    logger.info('Dev token issued', { username: player.username, playerId: player.id });

    res.json({ token, playerId: player.id, username: player.username, role: player.role });
  } catch (err) {
    logger.error('Failed to issue dev token', { err, username });
    res.status(500).json({ error: 'Internal server error' });
  }
});
