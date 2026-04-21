/**
 * Handler Unit Tests (error paths)
 *
 * Unit tests for the handler error paths that integration tests don't cover.
 */

jest.mock('../src/redis/client', () => ({
  redis: {
    sadd: jest.fn().mockResolvedValue(1),
    sismember: jest.fn().mockResolvedValue(0),
    smembers: jest.fn().mockResolvedValue([]),
    srem: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
    mget: jest.fn().mockResolvedValue([]),
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
import { leaveRoomHandler } from '../src/handlers/leaveRoom';
import { tableChatHandler } from '../src/handlers/tableChat';
import type { BotController } from '../src/bots/BotController';
import { redis } from '../src/redis/client';

const mockRedis = redis as jest.Mocked<typeof redis>;

function makeSocket(playerId: string) {
  const emit = jest.fn();
  const join = jest.fn().mockResolvedValue(undefined);
  const leave = jest.fn().mockResolvedValue(undefined);
  const toEmit = jest.fn();
  const nsp = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return {
    data: { user: { playerId, username: playerId, displayName: 'Display', role: 'player' } },
    emit,
    join,
    leave,
    to: jest.fn().mockReturnValue({ emit: toEmit }),
    nsp,
    _toEmit: toEmit,
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

  it('emits room_roster to the joining socket (authoritative initial list)', async () => {
    (mockRedis.smembers as jest.Mock).mockResolvedValueOnce(['p1', 'p2']);
    (mockRedis.mget as jest.Mock).mockResolvedValueOnce(['Alice', 'Bob']);
    const socket = makeSocket('p1');
    await joinRoomHandler(socket, { roomId: 'r1' });
    const rosterCall = socket.emit.mock.calls.find(
      ([e]: string[]) => e === 'room_roster',
    );
    expect(rosterCall).toBeDefined();
    expect(rosterCall[1].players).toEqual([
      { playerId: 'p1', displayName: 'Alice' },
      { playerId: 'p2', displayName: 'Bob' },
    ]);
  });

  it('does NOT self-emit player_joined (prevents waiting-room double-add race)', async () => {
    const socket = makeSocket('p1');
    await joinRoomHandler(socket, { roomId: 'r1' });
    const selfJoined = socket.emit.mock.calls.find(
      ([e]: string[]) => e === 'player_joined',
    );
    expect(selfJoined).toBeUndefined();
    // But the broadcast to peers must still happen.
    expect(socket.to).toHaveBeenCalledWith('r1');
  });
});

describe('leaveRoomHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is a no-op when roomId is missing (doesn\'t throw)', async () => {
    const socket = makeSocket('p1');
    await expect(leaveRoomHandler(socket, { roomId: '' })).resolves.toBeUndefined();
    expect(mockRedis.srem).not.toHaveBeenCalled();
  });

  it('removes the player from room:players and broadcasts player_left when game has NOT started', async () => {
    (mockRedis.exists as jest.Mock).mockResolvedValueOnce(0);
    const socket = makeSocket('p1');
    await leaveRoomHandler(socket, { roomId: 'r1' });
    expect(mockRedis.srem).toHaveBeenCalledWith('room:players:r1', 'p1');
    expect(socket.to).toHaveBeenCalledWith('r1');
    expect(socket._toEmit).toHaveBeenCalledWith('player_left', { playerId: 'p1' });
  });

  it('keeps the roster entry when a game is already in progress', async () => {
    (mockRedis.exists as jest.Mock).mockResolvedValueOnce(1);
    const socket = makeSocket('p1');
    await leaveRoomHandler(socket, { roomId: 'r1' });
    expect(mockRedis.srem).not.toHaveBeenCalled();
    // No player_left broadcast either — peers in an active game should not
    // see a leave event for a mid-hand disconnect.
    expect(socket._toEmit).not.toHaveBeenCalledWith('player_left', expect.anything());
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
