/**
 * Auth Middleware
 *
 * Dev mode  (AUTH_MODE=dev):   validates HS256 JWT signed with JWT_SECRET.
 * Production (AUTH_MODE=production): validates JWT via Azure AD B2C JWKS,
 *   then upserts a Player row (keyed by B2C sub) so the rest of the app has
 *   a stable DB playerId to work with.
 *
 * On success: attaches req.user = { playerId, username, displayName, role }.
 * On failure: responds 401 Unauthorized.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { DevTokenPayload, PlayerRole } from '@shared/auth';
import { logger } from '../utils/logger';
import { verifyB2CToken, pickUsername, pickDisplayName } from '../auth/b2cVerifier';
import { prisma } from '../db/prisma';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authMode = process.env.AUTH_MODE ?? 'dev';

  if (authMode === 'dev') {
    handleDevAuth(req, res, next);
    return;
  }

  // In production mode, refuse synchronously when B2C isn't configured. Going
  // into the async JWKS path would fail anyway, but async failure breaks tests
  // that assert status synchronously and hides config mistakes behind an
  // ambiguous "Invalid or expired token" response.
  if (!process.env.B2C_AUTHORITY || !process.env.B2C_CLIENT_ID) {
    res.status(401).json({ error: 'Production auth not configured' });
    return;
  }

  void handleB2CAuth(req, res, next);
}

function extractBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length);
}

function handleDevAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error('JWT_SECRET environment variable is not set');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as DevTokenPayload;
    req.user = {
      playerId: decoded.sub,
      username: decoded.username,
      displayName: decoded.displayName,
      role: decoded.role,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token has expired' });
    } else if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
    } else {
      logger.error('Unexpected error verifying JWT', { err });
      res.status(401).json({ error: 'Token verification failed' });
    }
  }
}

async function handleB2CAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  try {
    const claims = await verifyB2CToken(token);
    const username = pickUsername(claims);
    const displayName = pickDisplayName(claims);

    const player = await prisma.player.upsert({
      where: { username },
      update: { displayName },
      create: {
        username,
        displayName,
        role: 'player',
      },
      select: { id: true, username: true, displayName: true, role: true },
    });

    req.user = {
      playerId: player.id,
      username: player.username,
      displayName: player.displayName,
      role: player.role as PlayerRole,
    };
    next();
  } catch (err) {
    const e = err as Error & { code?: string; claim?: string; reason?: string };
    logger.warn('B2C token validation failed', {
      name: e?.name,
      message: e?.message,
      code: e?.code,
      claim: e?.claim,
      reason: e?.reason,
    });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
