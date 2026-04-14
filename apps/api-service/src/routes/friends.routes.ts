/**
 * Friends Routes
 *
 * GET    /api/v1/friends                  — list friends (auth required)
 * POST   /api/v1/friends/request          — send friend request (auth required)
 * PATCH  /api/v1/friends/:id/accept       — accept friend request (auth required)
 * PATCH  /api/v1/friends/:id/block        — block a friend (auth required)
 * DELETE /api/v1/friends/:id              — remove friend (auth required)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../db/prisma';
import {
  listFriends,
  sendFriendRequest,
  acceptFriendRequest,
  blockFriendRelation,
  removeFriend,
} from '../services/friends.service';
import { logger } from '../utils/logger';

export const friendsRouter = Router();

friendsRouter.use(authMiddleware);

// GET /api/v1/friends
friendsRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const friends = await listFriends(req.user!.playerId);
    // Return array directly per shared-types contract
    res.json(friends);
  } catch (err) {
    logger.error('GET /friends failed', { err });
    next(err);
  }
});

// POST /api/v1/friends/request
friendsRouter.post('/request', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { toPlayerId: bodyToPlayerId, toUsername } = req.body as {
      toPlayerId?: string;
      toUsername?: string;
    };

    let toPlayerId = bodyToPlayerId;
    if (!toPlayerId && toUsername) {
      // Look up player by username (used by test suites)
      const target = await prisma.player.findUnique({
        where: { username: toUsername },
        select: { id: true },
      });
      if (!target) {
        res.status(404).json({ error: `Player '${toUsername}' not found` });
        return;
      }
      toPlayerId = target.id;
    }

    if (!toPlayerId || typeof toPlayerId !== 'string') {
      res.status(400).json({ error: 'toPlayerId or toUsername is required' });
      return;
    }

    try {
      const relation = await sendFriendRequest(req.user!.playerId, toPlayerId);
      res.status(201).json(relation);
    } catch (serviceErr) {
      const e = serviceErr as Error & { statusCode?: number };
      if (e.statusCode === 400) {
        res.status(400).json({ error: e.message });
        return;
      }
      if (e.statusCode === 409) {
        res.status(409).json({ error: e.message });
        return;
      }
      throw serviceErr;
    }
  } catch (err) {
    logger.error('POST /friends/request failed', { err });
    next(err);
  }
});

// PATCH /api/v1/friends/:id/accept
friendsRouter.patch('/:id/accept', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let relation;
    try {
      relation = await acceptFriendRequest(req.params['id']!, req.user!.playerId);
    } catch (serviceErr) {
      const e = serviceErr as Error & { statusCode?: number };
      if (e.statusCode === 403) {
        res.status(403).json({ error: e.message });
        return;
      }
      throw serviceErr;
    }

    if (!relation) {
      res.status(404).json({ error: 'Friend relation not found' });
      return;
    }

    res.json(relation);
  } catch (err) {
    logger.error('PATCH /friends/:id/accept failed', { err });
    next(err);
  }
});

// PATCH /api/v1/friends/:id/block
friendsRouter.patch('/:id/block', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let relation;
    try {
      relation = await blockFriendRelation(req.params['id']!, req.user!.playerId);
    } catch (serviceErr) {
      const e = serviceErr as Error & { statusCode?: number };
      if (e.statusCode === 403) {
        res.status(403).json({ error: e.message });
        return;
      }
      throw serviceErr;
    }

    if (!relation) {
      res.status(404).json({ error: 'Friend relation not found' });
      return;
    }

    res.json(relation);
  } catch (err) {
    logger.error('PATCH /friends/:id/block failed', { err });
    next(err);
  }
});

// DELETE /api/v1/friends/:id
friendsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let deleted;
    try {
      deleted = await removeFriend(req.params['id']!, req.user!.playerId);
    } catch (serviceErr) {
      const e = serviceErr as Error & { statusCode?: number };
      if (e.statusCode === 403) {
        res.status(403).json({ error: e.message });
        return;
      }
      throw serviceErr;
    }

    if (!deleted) {
      res.status(404).json({ error: 'Friend relation not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('DELETE /friends/:id failed', { err });
    next(err);
  }
});
