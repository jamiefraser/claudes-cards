/**
 * Augment Express Request to carry the authenticated user payload.
 * Populated by the authMiddleware after successful JWT validation.
 */

import { PlayerRole } from '@shared/auth';

declare global {
  namespace Express {
    interface Request {
      user?: {
        playerId: string;
        username: string;
        displayName: string;
        role: PlayerRole;
      };
    }
  }
}
