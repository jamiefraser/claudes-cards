/**
 * Games Routes
 *
 * GET /api/v1/games              — list game catalog entries (auth required)
 * GET /api/v1/games/replay/:roomId — get game action replay (admin OR AUTH_MODE=dev)
 * GET /api/v1/games/:id          — get game details (auth required)
 *
 * IMPORTANT: /replay/:roomId must be registered before /:id to avoid conflicts.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';
import type { GameCatalogEntry } from '@shared/admin';

export const gamesRouter = Router();

gamesRouter.use(authMiddleware);

// GET /api/v1/games
gamesRouter.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const games = await prisma.gameCatalog.findMany({
      orderBy: { name: 'asc' },
    });

    const activeRoomCounts = await prisma.room.groupBy({
      by: ['gameId'],
      where: { status: 'playing' },
      _count: { id: true },
    });

    const countMap = new Map(
      activeRoomCounts.map((r: { gameId: string; _count: { id: number } | undefined }) => [
        r.gameId,
        r._count?.id ?? 0,
      ]),
    );

    const entries: GameCatalogEntry[] = games.map((g) => ({
      id: g.id,
      name: g.name,
      category: g.category,
      enabled: g.enabled,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers,
      supportsAsync: g.supportsAsync,
      activeRoomCount: countMap.get(g.id) ?? 0,
    }));

    // Return array directly — frontend expects GameCatalogEntry[]
    res.json(entries);
  } catch (err) {
    logger.error('GET /games failed', { err });
    next(err);
  }
});

// GET /api/v1/games/replay/:roomId
// Accessible to admin role OR when AUTH_MODE=dev (SPEC.md §25.2)
gamesRouter.get(
  '/replay/:roomId',
  (req: Request, res: Response, next: NextFunction): void => {
    const authMode = process.env.AUTH_MODE ?? 'dev';
    if (authMode === 'dev') {
      // Allow all authenticated users in dev mode
      next();
      return;
    }
    // In production, require admin role
    requireRole('admin')(req, res, next);
  },
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roomId } = req.params;

      const actions = await prisma.gameAction.findMany({
        where: { roomId },
        orderBy: { appliedAt: 'asc' },
      });

      res.json({
        actions: actions.map((a) => ({
          id: a.id,
          roomId: a.roomId,
          gameId: a.gameId,
          playerId: a.playerId,
          actionJson: a.actionJson,
          isBot: a.isBot,
          appliedAt: a.appliedAt.toISOString(),
          resultVersion: a.resultVersion,
        })),
      });
    } catch (err) {
      logger.error('GET /games/replay/:roomId failed', { err });
      next(err);
    }
  },
);

// GET /api/v1/games/:id
gamesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const game = await prisma.gameCatalog.findUnique({
      where: { id: req.params['id'] },
    });

    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    const activeRoomCount = await prisma.room.count({
      where: { gameId: game.id, status: 'playing' },
    });

    const entry: GameCatalogEntry = {
      id: game.id,
      name: game.name,
      category: game.category,
      enabled: game.enabled,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      supportsAsync: game.supportsAsync,
      activeRoomCount,
    };

    res.json(entry);
  } catch (err) {
    logger.error('GET /games/:id failed', { err });
    next(err);
  }
});
