/**
 * Handler Unit Tests (error paths)
 *
 * Unit tests for the handler error paths that integration tests don't cover.
 */

jest.mock('../src/redis/client', () => ({
  redis: {
    sadd: jest.fn().mockResolvedValue(1),
    sismember: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue('OK'),
    lrange: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(1),
    rpush: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../src/redis/pubsub', () => ({
  redisSub: { psubscribe: jest.fn(), on: jest.fn() },
}));

import { joinRoomHandler } from '../src/handlers/joinRoom';
import { rejoinRoomHandler } from '../src/handlers/rejoinRoom';
import { tableChatHandler } from '../src/handlers/tableChat';
import type { BotController } from '../src/bots/BotController';
import { redis } from '../src/redis/client';

const mockRedis = redis as jest.Mocked<typeof redis>;

function makeSocket(playerId: string) {
  const emit = jest.fn();
  const join = jest.fn().mockResolvedValue(undefined);
  const nsp = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return {
    data: { user: { playerId, username: playerId, displayName: 'Display', role: 'player' } },
    emit,
    join,
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    nsp,
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function makeBotController(isBotActiveReturn = false): jest.Mocked<BotController> {
  return {
    isBotActive: jest.fn().mockReturnValue(isBotActiveReturn),
    yieldBot: jest.fn().mockResolvedValue(undefined),
    activateBot: jest.fn().mockResolvedValue(undefined),
    scheduleAction: jest.fn().mockResolvedValue(undefined),
    deactivateAll: jest.fn().mockResolvedValue(undefined),
    hydrateFromRedis: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<BotController>;
}

describe('joinRoomHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emits game_error when roomId is missing', async () => {
    const socket = makeSocket('p1');
    await joinRoomHandler(socket, { roomId: '' });
    expect(socket.emit).toHaveBeenCalledWith(
      'game_error',
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    );
  });

  it('emits game_state_sync with state when state exists', async () => {
    const state = { version: 1, roomId: 'r1' };
    (mockRedis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(state));
    const socket = makeSocket('p1');
    await joinRoomHandler(socket, { roomId: 'r1' });
    const call = socket.emit.mock.calls.find(([event]: string[]) => event === 'game_state_sync');
    expect(call).toBeDefined();
    expect(call[1].state).toEqual(state);
  });

  it('emits game_error when Redis throws', async () => {
    (mockRedis.sadd as jest.Mock).mockRejectedValueOnce(new Error('Redis error'));
    const socket = makeSocket('p1');
    await joinRoomHandler(socket, { roomId: 'r1' });
    expect(socket.emit).toHaveBeenCalledWith(
      'game_error',
      expect.objectContaining({ code: 'JOIN_FAILED' }),
    );
  });
});

describe('rejoinRoomHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emits game_error when roomId is missing', async () => {
    const socket = makeSocket('p1');
    const bc = makeBotController();
    await rejoinRoomHandler(socket, { roomId: '' }, bc);
    expect(socket.emit).toHaveBeenCalledWith(
      'game_error',
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    );
  });

  it('emits game_error NOT_MEMBER when player is not in room', async () => {
    (mockRedis.sismember as jest.Mock).mockResolvedValueOnce(0);
    const socket = makeSocket('p1');
    const bc = makeBotController();
    await rejoinRoomHandler(socket, { roomId: 'room-1' }, bc);
    expect(socket.emit).toHaveBeenCalledWith(
      'game_error',
      expect.objectContaining({ code: 'NOT_MEMBER' }),
    );
  });

  it('yields bot when bot is active for rejoining player', async () => {
    (mockRedis.sismember as jest.Mock).mockResolvedValueOnce(1);
    const socket = makeSocket('p1');
    const bc = makeBotController(true); // bot IS active
    await rejoinRoomHandler(socket, { roomId: 'room-1' }, bc);
    expect(bc.yieldBot).toHaveBeenCalledWith('room-1', 'p1');
  });

  it('sends chat_history when history exists', async () => {
    (mockRedis.sismember as jest.Mock).mockResolvedValueOnce(1);
    const msg = { id: '1', content: 'hi' };
    (mockRedis.lrange as jest.Mock).mockResolvedValueOnce([JSON.stringify(msg)]);
    const socket = makeSocket('p1');
    const bc = makeBotController();
    await rejoinRoomHandler(socket, { roomId: 'room-1' }, bc);
    const call = socket.emit.mock.calls.find(([e]: string[]) => e === 'chat_history');
    expect(call).toBeDefined();
  });

  it('emits game_error when Redis throws', async () => {
    (mockRedis.sismember as jest.Mock).mockRejectedValueOnce(new Error('Redis error'));
    const socket = makeSocket('p1');
    const bc = makeBotController();
    await rejoinRoomHandler(socket, { roomId: 'room-1' }, bc);
    expect(socket.emit).toHaveBeenCalledWith(
      'game_error',
      expect.objectContaining({ code: 'REJOIN_FAILED' }),
    );
  });
});

describe('tableChatHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emits game_error when roomId is missing', async () => {
    const socket = makeSocket('p1');
    await tableChatHandler(socket, { roomId: '', content: 'hello' });
    expect(socket.emit).toHaveBeenCalledWith(
      'game_error',
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    );
  });

  it('emits game_error when content is missing', async () => {
    const socket = makeSocket('p1');
    await tableChatHandler(socket, { roomId: 'r1', content: '' });
    expect(socket.emit).toHaveBeenCalledWith(
      'game_error',
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    );
  });

  it('does nothing for whitespace-only content', async () => {
    const socket = makeSocket('p1');
    await tableChatHandler(socket, { roomId: 'r1', content: '   ' });
    expect(socket.emit).not.toHaveBeenCalled();
    expect(mockRedis.lpush).not.toHaveBeenCalled();
  });

  it('persists and broadcasts valid message', async () => {
    const socket = makeSocket('p1');
    await tableChatHandler(socket, { roomId: 'r1', content: 'Hello!' });
    expect(mockRedis.lpush).toHaveBeenCalledWith('chat:history:r1', expect.any(String));
    expect(mockRedis.ltrim).toHaveBeenCalledWith('chat:history:r1', 0, 99);
    expect(socket.nsp.to).toHaveBeenCalledWith('r1');
  });

  it('emits game_error when Redis throws', async () => {
    (mockRedis.lpush as jest.Mock).mockRejectedValueOnce(new Error('Redis error'));
    const socket = makeSocket('p1');
    await tableChatHandler(socket, { roomId: 'r1', content: 'Hello!' });
    expect(socket.emit).toHaveBeenCalledWith(
      'game_error',
      expect.objectContaining({ code: 'CHAT_FAILED' }),
    );
  });
});
