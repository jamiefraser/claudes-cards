/**
 * joinRoom Handler Integration Test
 *
 * Tests join_room socket event in the /game namespace.
 * Verifies: player added to Redis SET, socket joins room, state_sync emitted.
 */

jest.mock('../src/redis/client', () => ({
  redis: {
    sadd: jest.fn().mockResolvedValue(1),
    sismember: jest.fn().mockResolvedValue(0),
    smembers: jest.fn().mockResolvedValue(['player-join-test']),
    srem: jest.fn().mockResolvedValue(1),
    mget: jest.fn().mockResolvedValue(['player-join-test']),
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
const TEST_PORT = 14001;

function makeToken(playerId: string, role = 'player'): string {
  return jwt.sign(
    { sub: playerId, username: `user-${playerId}`, displayName: `Player ${playerId}`, role },
    TEST_SECRET,
    { expiresIn: '1h' },
  );
}

describe('joinRoom handler', () => {
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

  it('receives room_roster with itself after join_room', (done) => {
    // The joining socket used to also receive its own `player_joined`,
    // but that raced with the waiting-room seed-self effect and produced
    // a duplicate entry. Now the joining socket receives the
    // authoritative `room_roster` list instead; peers receive
    // `player_joined`.
    client = ioc(`http://localhost:${TEST_PORT}/game`, {
      auth: { token: makeToken('player-join-test') },
    });

    client.on('connect', () => {
      client.emit('join_room', { roomId: 'test-room-1' });
    });

    client.on('room_roster', (payload: { players: Array<{ playerId: string }> }) => {
      expect(payload.players.map((p) => p.playerId)).toContain('player-join-test');
      done();
    });

    client.on('connect_error', (err) => done(err));
  });

  it('receives game_state_sync after join_room when no state exists', (done) => {
    client = ioc(`http://localhost:${TEST_PORT}/game`, {
      auth: { token: makeToken('player-sync-test') },
    });

    client.on('connect', () => {
      client.emit('join_room', { roomId: 'test-room-2' });
    });

    client.on('game_state_sync', (payload: unknown) => {
      expect(payload).toBeDefined();
      done();
    });

    client.on('connect_error', (err) => done(err));
  });

  it('rejects connection without a token', (done) => {
    const badClient = ioc(`http://localhost:${TEST_PORT}/game`);

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
});
