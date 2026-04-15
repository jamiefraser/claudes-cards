/**
 * B2C Token Verifier (socket-service)
 *
 * Mirrors apps/api-service/src/auth/b2cVerifier.ts. Duplicated rather than
 * shared via a package to keep the build graph simple; both files are short.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { logger } from '../utils/logger';

export interface B2CClaims extends JWTPayload {
  sub: string;
  emails?: string[];
  email?: string;
  preferred_username?: string;
  name?: string;
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedAuthority: string | null = null;

function getJwks(authority: string) {
  if (cachedJwks && cachedAuthority === authority) return cachedJwks;
  const url = new URL(`${authority.replace(/\/$/, '')}/discovery/v2.0/keys`);
  cachedJwks = createRemoteJWKSet(url, {
    cacheMaxAge: 10 * 60 * 1000,
    cooldownDuration: 30 * 1000,
  });
  cachedAuthority = authority;
  logger.info('b2cVerifier: JWKS configured', { url: url.toString() });
  return cachedJwks;
}

export async function verifyB2CToken(token: string): Promise<B2CClaims> {
  const authority = process.env.B2C_AUTHORITY;
  const audience = process.env.B2C_CLIENT_ID;
  if (!authority || !audience) {
    throw new Error('B2C_AUTHORITY and B2C_CLIENT_ID must be set for production auth');
  }

  const jwks = getJwks(authority);

  const { payload } = await jwtVerify(token, jwks, {
    audience,
    algorithms: ['RS256'],
    clockTolerance: '120s',
  });

  const expectedHost = new URL(authority).host;
  const iss = typeof payload.iss === 'string' ? payload.iss : '';
  if (!iss || new URL(iss).host !== expectedHost) {
    throw new Error(`Unexpected token issuer: ${iss}`);
  }

  return payload as B2CClaims;
}
