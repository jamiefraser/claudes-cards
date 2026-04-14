/**
 * Admin Routes
 *
 * All routes require authentication + moderator or admin role.
 * Admin-only routes additionally require requireRole('admin').
 * SPEC.md §25.1.
 *
 * GET    /api/v1/admin/dashboard                         — moderator+
 * GET    /api/v1/admin/reports                           — moderator+
 * PATCH  /api/v1/admin/reports/:id                      — moderator+
 * POST   /api/v1/admin/mute                             — moderator+
 * DELETE /api/v1/admin/mute/:playerId                   — moderator+
 * GET    /api/v1/admin/users/:id                        — moderator+
 * GET    /api/v1/admin/audit                            — moderator+
 * PATCH  /api/v1/admin/games/:id                        — admin only
 * POST   /api/v1/admin/leaderboards/:gameId/recalculate — admin only
 * DELETE /api/v1/admin/leaderboards/:gameId/monthly     — admin only
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getDashboardStats,
  getReports,
  actionReport,
  mutePlayer,
  unmutePlayer,
  getAdminPlayerProfile,
  getAuditLog,
  setGameEnabled,
  recalculateLeaderboard,
  resetMonthlyLeaderboard,
} from '../services/admin.service';
import { logger } from '../utils/logger';
import type { ApplyMutePayload } from '@shared/admin';

export const adminRouter = Router();

// All admin routes require auth + at least moderator role
adminRouter.use(authMiddleware, requireRole('moderator', 'admin'));

// GET /api/v1/admin/dashboard
adminRouter.get(
  '/dashboard',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await getDashboardStats();
      res.json(stats);
    } catch (err) {
      logger.error('GET /admin/dashboard failed', { err });
      next(err);
    }
  },
);

// GET /api/v1/admin/reports
adminRouter.get(
  '/reports',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, page } = req.query as { status?: string; page?: string };

      const result = await getReports({
        status,
        page: page ? parseInt(page, 10) : undefined,
      });

      res.json(result);
    } catch (err) {
      logger.error('GET /admin/reports failed', { err });
      next(err);
    }
  },
);

// PATCH /api/v1/admin/reports/:id
adminRouter.patch(
  '/reports/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { action } = req.body as { action?: string };

      if (!action || !['dismiss', 'actioned'].includes(action)) {
        res.status(400).json({ error: 'action must be "dismiss" or "actioned"' });
        return;
      }

      const report = await actionReport(
        req.params['id']!,
        action as 'dismiss' | 'actioned',
        req.user!.playerId,
      );

      if (!report) {
        res.status(404).json({ error: 'Report not found' });
        return;
      }

      res.json(report);
    } catch (err) {
      logger.error('PATCH /admin/reports/:id failed', { err });
      next(err);
    }
  },
);

// POST /api/v1/admin/mute
adminRouter.post(
  '/mute',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as Partial<ApplyMutePayload>;

      if (!body.playerId || typeof body.playerId !== 'string') {
        res.status(400).json({ error: 'playerId is required' });
        return;
      }

      if (!body.duration) {
        res.status(400).json({ error: 'duration is required' });
        return;
      }

      const validDurations = ['15min', '1hr', '24hr', '7day', 'permanent'];
      if (!validDurations.includes(body.duration)) {
        res.status(400).json({ error: `duration must be one of: ${validDurations.join(', ')}` });
        return;
      }

      if (!body.reason || typeof body.reason !== 'string') {
        res.status(400).json({ error: 'reason is required' });
        return;
      }

      const muteRecord = await mutePlayer(
        { playerId: body.playerId, duration: body.duration, reason: body.reason },
        req.user!.playerId,
      );

      res.status(201).json(muteRecord);
    } catch (err) {
      logger.error('POST /admin/mute failed', { err });
      next(err);
    }
  },
);

// DELETE /api/v1/admin/mute/:playerId
adminRouter.delete(
  '/mute/:playerId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await unmutePlayer(req.params['playerId']!, req.user!.playerId);
      res.json(result);
    } catch (err) {
      logger.error('DELETE /admin/mute/:playerId failed', { err });
      next(err);
    }
  },
);

// GET /api/v1/admin/users/:id
adminRouter.get(
  '/users/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await getAdminPlayerProfile(req.params['id']!);

      if (!profile) {
        res.status(404).json({ error: 'Player not found' });
        return;
      }

      res.json(profile);
    } catch (err) {
      logger.error('GET /admin/users/:id failed', { err });
      next(err);
    }
  },
);

// GET /api/v1/admin/audit
adminRouter.get(
  '/audit',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { playerId, page } = req.query as { playerId?: string; page?: string };

      const result = await getAuditLog({
        playerId,
        page: page ? parseInt(page, 10) : undefined,
      });

      res.json(result);
    } catch (err) {
      logger.error('GET /admin/audit failed', { err });
      next(err);
    }
  },
);

// PATCH /api/v1/admin/games/:id — admin only
adminRouter.patch(
  '/games/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { enabled } = req.body as { enabled?: boolean };

      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled (boolean) is required' });
        return;
      }

      const game = await setGameEnabled(req.params['id']!, enabled);

      if (!game) {
        res.status(404).json({ error: 'Game not found' });
        return;
      }

      res.json(game);
    } catch (err) {
      logger.error('PATCH /admin/games/:id failed', { err });
      next(err);
    }
  },
);

// POST /api/v1/admin/leaderboards/:gameId/recalculate — admin only
adminRouter.post(
  '/leaderboards/:gameId/recalculate',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await recalculateLeaderboard(req.params['gameId']!);
      res.json(result);
    } catch (err) {
      logger.error('POST /admin/leaderboards/:gameId/recalculate failed', { err });
      next(err);
    }
  },
);

// DELETE /api/v1/admin/leaderboards/:gameId/monthly — admin only
adminRouter.delete(
  '/leaderboards/:gameId/monthly',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await resetMonthlyLeaderboard(req.params['gameId']!);
      res.json(result);
    } catch (err) {
      logger.error('DELETE /admin/leaderboards/:gameId/monthly failed', { err });
      next(err);
    }
  },
);
