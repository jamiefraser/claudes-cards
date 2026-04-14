/**
 * Presence Handler Unit Tests
 */

jest.mock('../src/redis/client', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../src/redis/pubsub', () => ({
  redisSub: {
    subscribe: jest.fn(),
    psubscribe: jest.fn(),
    on: jest.fn(),
  },
}));

import { setPresence, clearPresence, startPresenceHeartbeat } from '../src/handlers/presence';
import { redis } from '../src/redis/client';

const mockRedis = redis as jest.Mocked<typeof redis>;

function makeSocket(playerId: string) {
  return {
    data: {
      user: { playerId, username: playerId, displayName: playerId, role: 'player' },
    },
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('presence handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('setPresence sets presence:player key with TTL', async () => {
    const socket = makeSocket('player-1');
    await setPresence(socket, 'online');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'presence:player:player-1',
      'online',
      'EX',
      30,
    );
  });

  it('setPresence sets presence:room key when roomId provided', async () => {
    const socket = makeSocket('player-1');
    await setPresence(socket, 'in-game', 'room-1');
    expect(mockRedis.set).toHaveBeenCalledWith(
      'presence:room:player-1',
      'room-1',
      'EX',
      30,
    );
  });

  it('clearPresence deletes both presence keys', async () => {
    await clearPresence('player-2');
    expect(mockRedis.del).toHaveBeenCalledWith('presence:player:player-2');
    expect(mockRedis.del).toHaveBeenCalledWith('presence:room:player-2');
  });

  it('startPresenceHeartbeat returns an interval ID', () => {
    const socket = makeSocket('player-3');
    const intervalId = startPresenceHeartbeat(socket, 'online');
    expect(intervalId).toBeDefined();
    clearInterval(intervalId);
  });

  it('setPresence handles Redis errors gracefully', async () => {
    (mockRedis.set as jest.Mock).mockRejectedValueOnce(new Error('Redis down'));
    const socket = makeSocket('player-4');
    // Should not throw
    await expect(setPresence(socket, 'online')).resolves.toBeUndefined();
  });

  it('clearPresence handles Redis errors gracefully', async () => {
    (mockRedis.del as jest.Mock).mockRejectedValueOnce(new Error('Redis down'));
    // Should not throw
    await expect(clearPresence('player-5')).resolves.toBeUndefined();
  });
});
