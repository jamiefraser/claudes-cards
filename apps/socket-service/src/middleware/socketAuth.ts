/**
 * Socket Auth Middleware
 *
 * Validates JWT on socket handshake (from socket.handshake.auth.token).
 * AUTH_MODE=dev:        HS256 via jsonwebtoken.
 * AUTH_MODE=production: validates B2C id token via JWKS, then resolves the
 *   DB playerId/displayName/role by calling api-service /auth/me. api-service
 *   is the single upsert point so we don't need Prisma here.
 *
 * On success: attaches socket.data.user = { playerId, username, displayName, role }.
 * On failure: calls next(new Error('authentication_error')).
 */

import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { DevTokenPayload, PlayerRole } from '@card-platform/shared-types';
import { logger } from '../utils/logger';
import { verifyB2CToken } from '../auth/b2cVerifier';

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

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://api-service:3001/api/v1';

export function socketAuthMiddleware(socket: Socket, next: SocketNextFn): void {
  const authMode = process.env.AUTH_MODE ?? 'dev';

  if (authMode === 'dev') {
    handleDevAuth(socket, next);
    return;
  }

  void handleB2CAuth(socket, next);
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

async function handleB2CAuth(socket: Socket, next: SocketNextFn): Promise<void> {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== 'string') {
    next(new Error('authentication_error'));
    return;
  }

  try {
    await verifyB2CToken(token);

    const profileRes = await fetch(`${API_INTERNAL_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!profileRes.ok) {
      logger.warn('Socket B2C handshake: /auth/me lookup failed', {
        status: profileRes.status,
      });
      next(new Error('authentication_error'));
      return;
    }
    const profile = (await profileRes.json()) as {
      id: string;
      username: string;
      displayName: string;
      role: PlayerRole;
    };

    socket.data.user = {
      playerId: profile.id,
      username: profile.username,
      displayName: profile.displayName,
      role: profile.role,
    };
    next();
  } catch (err) {
    logger.debug('Socket B2C token invalid', { err: (err as Error).message });
    next(new Error('authentication_error'));
  }
}
