/**
 * Auth Routes
 *
 * GET /api/v1/auth/me — returns current player profile (auth required)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getMyProfile } from '../services/auth.service';
import { logger } from '../utils/logger';

export const authRouter = Router();

authRouter.use(authMiddleware);

// GET /api/v1/auth/me
authRouter.get('/me', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const playerId = req.user!.playerId;
    const profile = await getMyProfile(playerId);

    if (!profile) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    res.json(profile);
  } catch (err) {
    logger.error('GET /auth/me failed', { err });
    next(err);
  }
});
