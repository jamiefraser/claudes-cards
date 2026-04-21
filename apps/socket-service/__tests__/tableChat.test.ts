/**
 * tableChat Handler Integration Test
 */

jest.mock('../src/redis/client', () => ({
  redis: {
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue('OK'),
    sadd: jest.fn().mockResolvedValue(1),
    sismember: jest.fn().mockResolvedValue(0),
    smembers: jest.fn().mockResolvedValue([]),
    srem: jest.fn().mockResolvedValue(1),
    mget: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    hexists: jest.fn().mockResolvedValue(0),
    hset: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    lrange: jest.fn().mockResolvedValue([]),
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
const TEST_PORT = 14005;

function makeToken(playerId: string): string {
  return jwt.sign(
    { sub: playerId, username: `user-${playerId}`, displayName: `Player ${playerId}`, role: 'player' },
    TEST_SECRET,
    { expiresIn: '1h' },
  );
}

describe('tableChat handler', () => {
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

  it('broadcasts chat_message to the room', (done) => {
    client = ioc(`http://localhost:${TEST_PORT}/game`, {
      auth: { token: makeToken('chat-player') },
    });

    client.on('connect', () => {
      client.emit('join_room', { roomId: 'chat-room' });
    });

    client.on('game_state_sync', () => {
      client.emit('chat_message', { roomId: 'chat-room', content: 'Hello!' });
    });

    client.on('chat_message', (payload: { content: string; senderId: string }) => {
      expect(payload.content).toBe('Hello!');
      expect(payload.senderId).toBe('chat-player');
      done();
    });

    client.on('connect_error', (err) => done(err));
  });

  it('does not emit game_error for valid chat', (done) => {
    client = ioc(`http://localhost:${TEST_PORT}/game`, {
      auth: { token: makeToken('chat-player-2') },
    });

    let gotError = false;
    client.on('game_error', () => {
      gotError = true;
    });

    client.on('connect', () => {
      client.emit('join_room', { roomId: 'chat-room-2' });
    });

    client.on('game_state_sync', () => {
      client.emit('chat_message', { roomId: 'chat-room-2', content: 'Valid message' });
    });

    client.on('chat_message', () => {
      expect(gotError).toBe(false);
      done();
    });

    client.on('connect_error', (err) => done(err));
  });
});
