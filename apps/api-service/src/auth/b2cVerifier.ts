/**
 * B2C Token Verifier
 *
 * Validates Azure AD B2C id tokens via the tenant's JWKS endpoint.
 * Caches the JWKS set and only hits the network when the signing key rotates.
 *
 * Env:
 *   B2C_AUTHORITY  — e.g. https://cards.b2clogin.com/cards.onmicrosoft.com/B2C_1_SUSI
 *   B2C_CLIENT_ID  — app registration client id (= expected token audience)
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { logger } from '../utils/logger';

export interface B2CClaims extends JWTPayload {
  sub: string;
  emails?: string[];
  email?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
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

/**
 * Verify a B2C id token.
 * Throws on failure (caller should surface 401).
 * The issuer claim is host-matched against the authority rather than compared
 * exactly, because B2C puts the tenant GUID in the issuer but we only have
 * the tenant-name-based authority URL in config.
 */
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

/** Pull the best username from B2C claims (email preferred, fallback to sub). */
export function pickUsername(claims: B2CClaims): string {
  return (
    claims.emails?.[0] ??
    claims.email ??
    claims.preferred_username ??
    claims.sub
  );
}

/** Pull the best display name. */
export function pickDisplayName(claims: B2CClaims): string {
  if (claims.name) return claims.name;
  const combined = [claims.given_name, claims.family_name].filter(Boolean).join(' ').trim();
  return combined || pickUsername(claims);
}
