/**
 * RequireRole Middleware
 *
 * Use after authMiddleware on any route that requires specific role(s).
 * Returns 403 Forbidden if the authenticated user's role is not in the allowed set.
 *
 * Usage:
 *   router.get('/admin', authMiddleware, requireRole('admin'), handler);
 *   router.get('/mods', authMiddleware, requireRole('admin', 'moderator'), handler);
 */

import { Request, Response, NextFunction } from 'express';
import { PlayerRole } from '@shared/auth';

export function requireRole(...roles: PlayerRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
