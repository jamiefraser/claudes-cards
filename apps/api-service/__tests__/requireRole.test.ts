/**
 * RequireRole Middleware Tests — Unit 3
 *
 * Tests that role-based access control works correctly.
 */

import { Request, Response, NextFunction } from 'express';
import { requireRole } from '../src/middleware/requireRole';
import { PlayerRole } from '@shared/auth';

function mockUser(role: PlayerRole) {
  return { playerId: 'some-id', username: 'test', displayName: 'Test User', role };
}

function mockRequest(user?: ReturnType<typeof mockUser>): Partial<Request> {
  const req: Partial<Request> = {};
  if (user) req.user = user;
  return req;
}

function mockResponse() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json, res: { status } as unknown as Partial<Response> };
}

const next: NextFunction = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requireRole middleware', () => {
  it('calls next when user has the required role', () => {
    const req = mockRequest(mockUser('admin')) as Request;
    const { res } = mockResponse();

    requireRole('admin')(req, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next when user has one of multiple allowed roles', () => {
    const req = mockRequest(mockUser('moderator')) as Request;
    const { res } = mockResponse();

    requireRole('admin', 'moderator')(req, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when user lacks the required role', () => {
    const req = mockRequest(mockUser('player')) as Request;
    const { status, json, res } = mockResponse();

    requireRole('admin')(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Insufficient permissions' }),
    );
  });

  it('returns 403 when req.user is absent (not authenticated)', () => {
    const req = mockRequest() as Request;
    const { status, json, res } = mockResponse();

    requireRole('admin')(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Insufficient permissions' }),
    );
  });

  it('moderator cannot access admin-only resources', () => {
    const req = mockRequest(mockUser('moderator')) as Request;
    const { status, res } = mockResponse();

    requireRole('admin')(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it('player can access player-level resources', () => {
    const req = mockRequest(mockUser('player')) as Request;
    const { res } = mockResponse();

    requireRole('player', 'moderator', 'admin')(req, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
