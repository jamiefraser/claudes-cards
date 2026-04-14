/**
 * Messages Routes
 *
 * GET  /api/v1/messages/dm/:playerId — get DM history with player (auth required)
 * POST /api/v1/messages/dm/:playerId — send DM (auth required)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getDMHistory, sendDM } from '../services/messages.service';
import { logger } from '../utils/logger';

export const messagesRouter = Router();

messagesRouter.use(authMiddleware);

// GET /api/v1/messages/dm/:playerId
messagesRouter.get(
  '/dm/:playerId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { playerId: otherPlayerId } = req.params;
      const { limit, offset } = req.query as { limit?: string; offset?: string };

      const result = await getDMHistory(
        req.user!.playerId,
        otherPlayerId!,
        limit ? parseInt(limit, 10) : undefined,
        offset ? parseInt(offset, 10) : undefined,
      );

      res.json(result);
    } catch (err) {
      logger.error('GET /messages/dm/:playerId failed', { err });
      next(err);
    }
  },
);

// POST /api/v1/messages/dm/:playerId
messagesRouter.post(
  '/dm/:playerId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { playerId: recipientId } = req.params;
      const { content } = req.body as { content?: string };

      if (!content || typeof content !== 'string') {
        res.status(400).json({ error: 'content is required' });
        return;
      }

      try {
        const message = await sendDM(req.user!.playerId, recipientId!, content);
        res.status(201).json(message);
      } catch (serviceErr) {
        const e = serviceErr as Error & { statusCode?: number };
        if (e.statusCode === 400) {
          res.status(400).json({ error: e.message });
          return;
        }
        if (e.statusCode === 404) {
          res.status(404).json({ error: e.message });
          return;
        }
        throw serviceErr;
      }
    } catch (err) {
      logger.error('POST /messages/dm/:playerId failed', { err });
      next(err);
    }
  },
);
