/**
 * Auth Middleware Tests — Unit 3
 *
 * Tests for the auth middleware in dev mode (AUTH_MODE=dev).
 * Covers: valid token, expired token, invalid signature, missing token.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../src/middleware/auth';

const TEST_SECRET = 'test-secret-do-not-use-in-prod';

// Helper to create a test JWT
function makeToken(payload: object, secret = TEST_SECRET, options?: jwt.SignOptions) {
  return jwt.sign(payload, secret, { expiresIn: '1h', ...options });
}

// Helper to build a mock Express request
function mockRequest(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: `Bearer ${authHeader}` } : {},
  };
}

function mockResponse(): { status: jest.Mock; json: jest.Mock; res: Partial<Response> } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status } as unknown as Partial<Response>;
  return { status, json, res };
}

const next: NextFunction = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AUTH_MODE = 'dev';
  process.env.JWT_SECRET = TEST_SECRET;
});

afterEach(() => {
  delete process.env.AUTH_MODE;
  delete process.env.JWT_SECRET;
});

describe('authMiddleware — dev mode', () => {
  it('attaches req.user on a valid token', () => {
    const payload = {
      sub: 'player-uuid-1',
      username: 'test-player-1',
      displayName: 'TestPlayer1',
      role: 'player',
    };
    const token = makeToken(payload);
    const req = mockRequest(token) as Request;
    const { res } = mockResponse();

    authMiddleware(req, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeDefined();
    expect(req.user?.playerId).toBe('player-uuid-1');
    expect(req.user?.username).toBe('test-player-1');
    expect(req.user?.role).toBe('player');
  });

  it('returns 401 when no Authorization header is present', () => {
    const req = mockRequest() as Request;
    const { status, json, res } = mockResponse();

    authMiddleware(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('returns 401 for an expired token', () => {
    const payload = {
      sub: 'player-uuid-1',
      username: 'test-player-1',
      displayName: 'TestPlayer1',
      role: 'player',
    };
    // Sign with a very short expiry that is already past
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: -1 });
    const req = mockRequest(token) as Request;
    const { status, json, res } = mockResponse();

    authMiddleware(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('returns 401 for a token signed with the wrong secret', () => {
    const payload = {
      sub: 'player-uuid-1',
      username: 'test-player-1',
      displayName: 'TestPlayer1',
      role: 'player',
    };
    const token = makeToken(payload, 'wrong-secret');
    const req = mockRequest(token) as Request;
    const { status, json, res } = mockResponse();

    authMiddleware(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('returns 401 for a malformed token string', () => {
    const req = mockRequest('not.a.valid.jwt.at.all') as Request;
    const { status, json, res } = mockResponse();

    authMiddleware(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('attaches moderator role correctly', () => {
    const payload = {
      sub: 'mod-uuid',
      username: 'test-moderator',
      displayName: 'TestMod',
      role: 'moderator',
    };
    const token = makeToken(payload);
    const req = mockRequest(token) as Request;
    const { res } = mockResponse();

    authMiddleware(req, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user?.role).toBe('moderator');
  });

  it('returns 500 when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    const token = makeToken({ sub: 'x', username: 'x', role: 'player' }, TEST_SECRET);
    const req = mockRequest(token) as Request;
    const { status, res } = mockResponse();

    authMiddleware(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(500);
    // Restore
    process.env.JWT_SECRET = TEST_SECRET;
  });

  it('returns 401 when AUTH_MODE=production (not yet configured)', () => {
    process.env.AUTH_MODE = 'production';
    const req = mockRequest('any-token') as Request;
    const { status, res } = mockResponse();

    authMiddleware(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    // Restore
    process.env.AUTH_MODE = 'dev';
  });
});
