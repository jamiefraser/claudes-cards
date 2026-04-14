/**
 * Leaderboard Routes
 *
 * GET /api/v1/leaderboard/:gameId         — get leaderboard (auth required)
 * GET /api/v1/leaderboard/:gameId/friends — get friends-only leaderboard (auth required)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getLeaderboard, getFriendsLeaderboard } from '../services/leaderboard.service';
import { logger } from '../utils/logger';

export const leaderboardRouter = Router();

leaderboardRouter.use(authMiddleware);

// GET /api/v1/leaderboard/:gameId/friends
// Must be registered before /:gameId to avoid conflict
leaderboardRouter.get(
  '/:gameId/friends',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = req.params;
      const { period, month, limit, offset } = req.query as {
        period?: string;
        month?: string;
        limit?: string;
        offset?: string;
      };

      const result = await getFriendsLeaderboard(req.user!.playerId, gameId!, {
        period: period === 'monthly' ? 'monthly' : 'all-time',
        month,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });

      res.json(result);
    } catch (err) {
      logger.error('GET /leaderboard/:gameId/friends failed', { err });
      next(err);
    }
  },
);

// GET /api/v1/leaderboard/:gameId
leaderboardRouter.get(
  '/:gameId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { gameId } = req.params;
      const { period, month, limit, offset } = req.query as {
        period?: string;
        month?: string;
        limit?: string;
        offset?: string;
      };

      const result = await getLeaderboard({
        gameId: gameId!,
        period: period === 'monthly' ? 'monthly' : 'all-time',
        month,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });

      res.json(result);
    } catch (err) {
      logger.error('GET /leaderboard/:gameId failed', { err });
      next(err);
    }
  },
);
