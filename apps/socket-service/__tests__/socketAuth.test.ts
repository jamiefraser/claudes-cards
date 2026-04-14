/**
 * Socket Auth Middleware Tests
 *
 * Tests JWT validation on socket handshake.
 * Covers: valid token, expired token, wrong secret, missing token, roles, production mode.
 */

import jwt from 'jsonwebtoken';
import { socketAuthMiddleware } from '../src/middleware/socketAuth';

const TEST_SECRET = 'test-secret';

function makeToken(
  payload: object,
  secret = TEST_SECRET,
  options?: jwt.SignOptions,
): string {
  return jwt.sign(payload, secret, { expiresIn: '1h', ...options });
}

/** Build a minimal mock Socket.io socket */
function makeSocket(token?: string) {
  return {
    handshake: {
      auth: token !== undefined ? { token } : {},
    },
    data: {} as Record<string, unknown>,
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

beforeEach(() => {
  process.env.AUTH_MODE = 'dev';
  process.env.JWT_SECRET = TEST_SECRET;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('socketAuthMiddleware — dev mode', () => {
  it('attaches socket.data.user on a valid token', (done) => {
    const payload = {
      sub: 'player-uuid-1',
      username: 'test-player-1',
      displayName: 'TestPlayer1',
      role: 'player',
    };
    const token = makeToken(payload);
    const socket = makeSocket(token);

    socketAuthMiddleware(socket, (err?: Error) => {
      expect(err).toBeUndefined();
      expect(socket.data.user).toBeDefined();
      expect(socket.data.user.playerId).toBe('player-uuid-1');
      expect(socket.data.user.username).toBe('test-player-1');
      expect(socket.data.user.displayName).toBe('TestPlayer1');
      expect(socket.data.user.role).toBe('player');
      done();
    });
  });

  it('calls next(error) when no token is provided', (done) => {
    const socket = makeSocket(undefined);

    socketAuthMiddleware(socket, (err?: Error) => {
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('authentication_error');
      done();
    });
  });

  it('calls next(error) for an expired token', (done) => {
    const payload = {
      sub: 'player-uuid-1',
      username: 'test-player-1',
      displayName: 'TestPlayer1',
      role: 'player',
    };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: -1 });
    const socket = makeSocket(token);

    socketAuthMiddleware(socket, (err?: Error) => {
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('authentication_error');
      done();
    });
  });

  it('calls next(error) for a token signed with the wrong secret', (done) => {
    const payload = {
      sub: 'player-uuid-1',
      username: 'test-player-1',
      displayName: 'TestPlayer1',
      role: 'player',
    };
    const token = makeToken(payload, 'wrong-secret');
    const socket = makeSocket(token);

    socketAuthMiddleware(socket, (err?: Error) => {
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('authentication_error');
      done();
    });
  });

  it('calls next(error) for a malformed token string', (done) => {
    const socket = makeSocket('not.a.real.jwt');

    socketAuthMiddleware(socket, (err?: Error) => {
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('authentication_error');
      done();
    });
  });

  it('attaches moderator role correctly', (done) => {
    const payload = {
      sub: 'mod-uuid',
      username: 'test-moderator',
      displayName: 'TestMod',
      role: 'moderator',
    };
    const token = makeToken(payload);
    const socket = makeSocket(token);

    socketAuthMiddleware(socket, (err?: Error) => {
      expect(err).toBeUndefined();
      expect(socket.data.user.role).toBe('moderator');
      done();
    });
  });

  it('calls next(error) when AUTH_MODE=production (not yet configured)', (done) => {
    process.env.AUTH_MODE = 'production';
    const socket = makeSocket('any-token');

    socketAuthMiddleware(socket, (err?: Error) => {
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('authentication_error');
      done();
    });
  });

  it('calls next(error) when JWT_SECRET is not set', (done) => {
    delete process.env.JWT_SECRET;
    const token = makeToken(
      { sub: 'x', username: 'x', displayName: 'X', role: 'player' },
      TEST_SECRET,
    );
    const socket = makeSocket(token);

    socketAuthMiddleware(socket, (err?: Error) => {
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toBe('authentication_error');
      // Restore
      process.env.JWT_SECRET = TEST_SECRET;
      done();
    });
  });
});
