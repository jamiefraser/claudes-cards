/**
 * Auth Middleware
 *
 * Dev mode  (AUTH_MODE=dev):   validates HS256 JWT signed with JWT_SECRET.
 * Production (AUTH_MODE=production): validates JWT via JWKS (Azure AD B2C).
 *
 * On success: attaches req.user = { playerId, username, displayName, role }.
 * On failure: responds 401 Unauthorized.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { DevTokenPayload } from '@shared/auth';
import { logger } from '../utils/logger';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authMode = process.env.AUTH_MODE ?? 'dev';

  if (authMode === 'dev') {
    handleDevAuth(req, res, next);
    return;
  }

  // AUTH_MODE=production — Azure AD B2C via JWKS
  // TODO: configure jwks-rsa with B2C JWKS endpoint once B2C tenant is provisioned.
  // Reference: SPEC.md §8 Auth Strategy — Production.
  logger.warn('Production auth mode not yet configured; rejecting all requests');
  res.status(401).json({ error: 'Production auth not configured' });
}

function handleDevAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);
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
