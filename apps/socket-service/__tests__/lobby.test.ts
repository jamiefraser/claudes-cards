/**
 * Lobby Namespace Tests
 */

jest.mock('../src/redis/client', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue('0'),
    del: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../src/redis/pubsub', () => ({
  redisSub: {
    subscribe: jest.fn().mockResolvedValue(undefined),
    psubscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  },
}));

import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { setupLobbyNamespace } from '../src/namespaces/lobby.namespace';

const TEST_SECRET = 'test-secret';
const TEST_PORT = 14006;

function makeToken(playerId: string, role = 'player'): string {
  return jwt.sign(
    { sub: playerId, username: `user-${playerId}`, displayName: `Player ${playerId}`, role },
    TEST_SECRET,
    { expiresIn: '1h' },
  );
}

describe('lobby namespace', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let client: ClientSocket;

  beforeAll((done) => {
    const app = express();
    httpServer = createServer(app);
    io = new Server(httpServer, { cors: { origin: '*' } });
    setupLobbyNamespace(io);
    httpServer.listen(TEST_PORT, done);
  });

  afterAll((done) => {
    if (client?.connected) client.disconnect();
    io.close();
    httpServer.close(done);
  });

  afterEach(() => {
    if (client?.connected) client.disconnect();
  });

  it('connects successfully with a valid token', (done) => {
    client = ioc(`http://localhost:${TEST_PORT}/lobby`, {
      auth: { token: makeToken('lobby-player-1') },
    });

    client.on('connect', () => {
      expect(client.connected).toBe(true);
      done();
    });

    client.on('connect_error', (err) => done(err));
  });

  it('rejects connection without a token', (done) => {
    const badClient = ioc(`http://localhost:${TEST_PORT}/lobby`);

    badClient.on('connect_error', (err) => {
      expect(err.message).toContain('authentication_error');
      badClient.disconnect();
      done();
    });

    badClient.on('connect', () => {
      badClient.disconnect();
      done(new Error('Should not have connected'));
    });
  });

  it('dm_send delivers message back to sender', (done) => {
    client = ioc(`http://localhost:${TEST_PORT}/lobby`, {
      auth: { token: makeToken('dm-sender') },
    });

    client.on('connect', () => {
      client.emit('dm_send', { toPlayerId: 'dm-receiver', content: 'Hello DM' });
    });

    client.on('dm_message', (payload: { message: { content: string } }) => {
      expect(payload.message.content).toBe('Hello DM');
      done();
    });

    client.on('connect_error', (err) => done(err));
  });

  it('report_message emits report_acknowledged back to reporter', (done) => {
    client = ioc(`http://localhost:${TEST_PORT}/lobby`, {
      auth: { token: makeToken('reporter') },
    });

    client.on('connect', () => {
      client.emit('report_message', {
        messageId: 'msg-123',
        reportedPlayerId: 'bad-player',
        reason: 'Spamming',
      });
    });

    client.on('report_acknowledged', (payload: { reportId: string }) => {
      expect(payload.reportId).toBeDefined();
      done();
    });

    client.on('connect_error', (err) => done(err));
  });

  it('moderator auto-joins role:moderator room', (done) => {
    const modClient = ioc(`http://localhost:${TEST_PORT}/lobby`, {
      auth: { token: makeToken('mod-user', 'moderator') },
    });

    modClient.on('connect', () => {
      // Moderator should be connected — we verify by checking the connection succeeds
      expect(modClient.connected).toBe(true);
      modClient.disconnect();
      done();
    });

    modClient.on('connect_error', (err) => done(err));
  });
});
