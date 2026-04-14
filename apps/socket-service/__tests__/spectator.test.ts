/**
 * Spectator and namespace integration tests
 * Tests spectator_join and disconnect in the /game namespace.
 */

jest.mock('../src/redis/client', () => ({
  redis: {
    sadd: jest.fn().mockResolvedValue(1),
    sismember: jest.fn().mockResolvedValue(0),
    smembers: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    hexists: jest.fn().mockResolvedValue(0),
    hset: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    lrange: jest.fn().mockResolvedValue([]),
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue('OK'),
    rpush: jest.fn().mockResolvedValue(1),
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
import { setupGameNamespace } from '../src/namespaces/game.namespace';
import { GameRegistry } from '../src/games/registry';
import { BotController } from '../src/bots/BotController';
import { BotPlayer } from '../src/bots/BotPlayer';

const TEST_SECRET = 'test-secret';
const TEST_PORT = 14007;

function makeToken(playerId: string): string {
  return jwt.sign(
    { sub: playerId, username: `user-${playerId}`, displayName: `Player ${playerId}`, role: 'player' },
    TEST_SECRET,
    { expiresIn: '1h' },
  );
}

describe('spectator_join handler', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let client: ClientSocket;

  beforeAll((done) => {
    const app = express();
    httpServer = createServer(app);
    io = new Server(httpServer, { cors: { origin: '*' } });

    const registry = new GameRegistry();
    const botController = new BotController();
    const botPlayer = new BotPlayer(registry, botController);

    setupGameNamespace(io, registry, botController, botPlayer);
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

  it('emits spectator_joined to room after spectator_join', (done) => {
    // Two clients: host joins room, spectator joins as spectator
    const hostClient = ioc(`http://localhost:${TEST_PORT}/game`, {
      auth: { token: makeToken('host-player') },
    });

    let hostReady = false;
    hostClient.on('connect', () => {
      hostClient.emit('join_room', { roomId: 'spectator-room' });
    });

    hostClient.on('game_state_sync', () => {
      if (!hostReady) {
        hostReady = true;
        // Now connect spectator
        client = ioc(`http://localhost:${TEST_PORT}/game`, {
          auth: { token: makeToken('spectator-user') },
        });

        client.on('connect', () => {
          client.emit('spectator_join', { roomId: 'spectator-room' });
        });

        hostClient.on('spectator_joined', (payload: { playerId: string }) => {
          expect(payload.playerId).toBe('spectator-user');
          hostClient.disconnect();
          done();
        });

        client.on('connect_error', (err) => {
          hostClient.disconnect();
          done(err);
        });
      }
    });

    hostClient.on('connect_error', (err) => done(err));
  });

  it('player can disconnect cleanly', (done) => {
    client = ioc(`http://localhost:${TEST_PORT}/game`, {
      auth: { token: makeToken('disconnect-player') },
    });

    client.on('connect', () => {
      // Verify connected then disconnect
      expect(client.connected).toBe(true);
      client.disconnect();
    });

    client.on('disconnect', () => {
      done();
    });

    client.on('connect_error', (err) => done(err));
  });
});
