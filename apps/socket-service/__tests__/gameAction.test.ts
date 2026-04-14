/**
 * gameAction Handler Integration Test
 *
 * Tests game_action socket event: validates turn, applies action, broadcasts delta.
 */

jest.mock('../src/redis/client', () => ({
  redis: {
    sadd: jest.fn().mockResolvedValue(1),
    sismember: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue(['player-action-test']),
    get: jest.fn(),
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
import type { GameState, IGameEngine } from '@card-platform/shared-types';
import { redis } from '../src/redis/client';

const mockRedis = redis as jest.Mocked<typeof redis>;

const TEST_SECRET = 'test-secret';
const TEST_PORT = 14004;

function makeToken(playerId: string, role = 'player'): string {
  return jwt.sign(
    { sub: playerId, username: `user-${playerId}`, displayName: `Player ${playerId}`, role },
    TEST_SECRET,
    { expiresIn: '1h' },
  );
}

function makeGameState(playerId: string): GameState {
  return {
    version: 1,
    roomId: 'action-room',
    gameId: 'generic',
    phase: 'playing',
    players: [
      {
        playerId,
        displayName: 'Player',
        hand: [{ id: 'c1', suit: 'hearts', rank: '2', deckType: 'standard', value: 2, faceUp: false }],
        score: 0,
        isOut: false,
        isBot: false,
      },
    ],
    currentTurn: playerId,
    turnNumber: 1,
    roundNumber: 1,
    publicData: {},
    updatedAt: new Date().toISOString(),
  };
}

function makeStubEngine(): IGameEngine {
  return {
    gameId: 'generic',
    supportsAsync: false,
    minPlayers: 2,
    maxPlayers: 6,
    startGame: jest.fn(),
    applyAction: jest.fn().mockImplementation((state: GameState) => ({
      ...state,
      version: state.version + 1,
      updatedAt: new Date().toISOString(),
    })),
    getValidActions: jest.fn().mockReturnValue([{ type: 'draw' }]),
    computeResult: jest.fn().mockReturnValue([]),
    isGameOver: jest.fn().mockReturnValue(false),
  };
}

describe('gameAction handler', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let client: ClientSocket;
  let registry: GameRegistry;

  beforeAll((done) => {
    const app = express();
    httpServer = createServer(app);
    io = new Server(httpServer, { cors: { origin: '*' } });

    registry = new GameRegistry();
    const engine = makeStubEngine();
    registry.register(engine);

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
    jest.clearAllMocks();
    if (client?.connected) client.disconnect();
  });

  it('emits game_state_delta after a valid game_action', (done) => {
    const playerId = 'player-action-test';
    const state = makeGameState(playerId);

    // SET NX lock → OK; GET state → state JSON; subsequent SET → OK
    (mockRedis.set as jest.Mock).mockResolvedValue('OK');
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(state));

    client = ioc(`http://localhost:${TEST_PORT}/game`, {
      auth: { token: makeToken(playerId) },
    });

    client.on('connect', () => {
      // First join the room so we're in the Socket.io room to receive broadcasts
      client.emit('join_room', { roomId: 'action-room' });
    });

    client.on('game_state_sync', () => {
      // After joining, send the game action
      client.emit('game_action', { roomId: 'action-room', action: { type: 'draw' } });
    });

    client.on('game_state_delta', (payload: { delta: unknown }) => {
      expect(payload.delta).toBeDefined();
      done();
    });

    client.on('game_error', (err: { code: string; message: string }) => {
      done(new Error(`game_error: ${err.code} — ${err.message}`));
    });

    client.on('connect_error', (err) => done(err));
  }, 15000);

  it('emits game_error when player is not whose turn it is', (done) => {
    const state = makeGameState('other-player');

    (mockRedis.set as jest.Mock).mockResolvedValue('OK');
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(state));

    client = ioc(`http://localhost:${TEST_PORT}/game`, {
      auth: { token: makeToken('player-action-test') },
    });

    client.on('connect', () => {
      client.emit('game_action', { roomId: 'action-room', action: { type: 'draw' } });
    });

    client.on('game_error', (err: { code: string }) => {
      expect(err.code).toBeDefined();
      done();
    });

    client.on('connect_error', (err) => done(err));
  });

  it('emits game_error when no game state exists', (done) => {
    (mockRedis.set as jest.Mock).mockResolvedValue('OK');
    (mockRedis.get as jest.Mock).mockResolvedValue(null); // no state

    client = ioc(`http://localhost:${TEST_PORT}/game`, {
      auth: { token: makeToken('player-action-test') },
    });

    client.on('connect', () => {
      client.emit('game_action', { roomId: 'action-room', action: { type: 'draw' } });
    });

    client.on('game_error', (err: { code: string }) => {
      expect(err.code).toBeDefined();
      done();
    });

    client.on('connect_error', (err) => done(err));
  });
});
