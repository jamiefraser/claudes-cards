/**
 * Players Routes
 *
 * GET /api/v1/players/search?q= — search players by displayName (auth required)
 * GET /api/v1/players/:id       — get player profile (auth required)
 *
 * IMPORTANT: /search must be registered before /:id so Express matches it first.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getPlayerProfile, searchPlayers } from '../services/auth.service';
import { logger } from '../utils/logger';

export const playersRouter = Router();

playersRouter.use(authMiddleware);

// GET /api/v1/players/search?q=
playersRouter.get('/search', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = req.query['q'] as string | undefined;

    if (!q || q.trim() === '') {
      res.status(400).json({ error: 'Query parameter q is required' });
      return;
    }

    const players = await searchPlayers(q.trim());
    res.json({ players });
  } catch (err) {
    logger.error('GET /players/search failed', { err });
    next(err);
  }
});

// GET /api/v1/players/:id
playersRouter.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const profile = await getPlayerProfile(id!);

    if (!profile) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    res.json(profile);
  } catch (err) {
    logger.error('GET /players/:id failed', { err });
    next(err);
  }
});
