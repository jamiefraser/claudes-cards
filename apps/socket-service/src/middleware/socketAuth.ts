/**
 * Socket Auth Middleware
 *
 * Validates JWT on socket handshake (from socket.handshake.auth.token).
 * AUTH_MODE=dev:        HS256 via jsonwebtoken
 * AUTH_MODE=production: JWKS skeleton with TODO
 *
 * On success: attaches socket.data.user = { playerId, username, displayName, role }
 * On failure: calls next(new Error('authentication_error'))
 */

import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { DevTokenPayload, PlayerRole } from '@card-platform/shared-types';
import { logger } from '../utils/logger';

export interface SocketUser {
  playerId: string;
  username: string;
  displayName: string;
  role: PlayerRole;
}

declare module 'socket.io' {
  interface SocketData {
    user: SocketUser;
  }
}

type SocketNextFn = (err?: Error) => void;

export function socketAuthMiddleware(socket: Socket, next: SocketNextFn): void {
  const authMode = process.env.AUTH_MODE ?? 'dev';

  if (authMode === 'dev') {
    handleDevAuth(socket, next);
    return;
  }

  // AUTH_MODE=production — Azure AD B2C via JWKS
  // TODO: configure jwks-rsa with B2C JWKS endpoint once B2C tenant is provisioned.
  // Reference: SPEC.md §8 Auth Strategy — Production.
  logger.warn('Production auth mode not yet configured; rejecting socket connection');
  next(new Error('authentication_error'));
}

function handleDevAuth(socket: Socket, next: SocketNextFn): void {
  const token: unknown = socket.handshake.auth?.token;

  if (!token || typeof token !== 'string') {
    next(new Error('authentication_error'));
    return;
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    logger.error('JWT_SECRET environment variable is not set');
    next(new Error('authentication_error'));
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as DevTokenPayload;

    socket.data.user = {
      playerId: decoded.sub,
      username: decoded.username,
      displayName: decoded.displayName,
      role: decoded.role,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      logger.debug('Socket token expired');
    } else if (err instanceof jwt.JsonWebTokenError) {
      logger.debug('Socket token invalid');
    } else {
      logger.error('Unexpected error verifying socket JWT', { err });
    }
    next(new Error('authentication_error'));
  }
}
