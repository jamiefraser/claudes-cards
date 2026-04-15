/**
 * BotController Tests
 *
 * Tests for all BotController methods:
 * activateBot, yieldBot, scheduleAction, deactivateAll, isBotActive.
 * Redis is mocked so tests run without a real Redis instance.
 */

// Mock ioredis before importing anything that uses it
jest.mock('../src/redis/client', () => ({
  redis: {
    hset: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue(null),
    hexists: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    exists: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    scan: jest.fn().mockResolvedValue(['0', []]),
  },
}));

jest.mock('../src/redis/pubsub', () => ({
  redisSub: {
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  },
}));

// Mock the BullMQ-backed turnTimer queue so scheduleAction can enqueue
// without a real Redis/BullMQ wired up.
jest.mock('../src/queues/turnTimer.queue', () => ({
  turnTimerQueue: {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  },
}));

// Mock the Socket.io server so BotController can emit
const mockEmit = jest.fn();
const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });

jest.mock('../src/index', () => ({
  getIO: jest.fn().mockReturnValue({
    of: jest.fn().mockReturnValue({ to: mockTo }),
  }),
}));

import { BotController } from '../src/bots/BotController';
import { redis } from '../src/redis/client';

const mockRedis = redis as jest.Mocked<typeof redis>;

describe('BotController', () => {
  let controller: BotController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BotController();
  });

  describe('isBotActive', () => {
    it('returns false for a seat with no active bot', () => {
      expect(controller.isBotActive('room-1', 'player-1')).toBe(false);
    });

    it('returns true after a bot has been activated (in-memory)', async () => {
      (mockRedis.hset as jest.Mock).mockResolvedValue(1);
      await controller.activateBot('room-1', 'player-1');
      expect(controller.isBotActive('room-1', 'player-1')).toBe(true);
    });
  });

  describe('activateBot', () => {
    it('sets bot:active HASH in Redis', async () => {
      await controller.activateBot('room-abc', 'player-xyz');
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'bot:active:room-abc',
        'player-xyz',
        expect.any(String),
      );
    });

    it('updates in-memory cache', async () => {
      await controller.activateBot('room-abc', 'player-xyz');
      expect(controller.isBotActive('room-abc', 'player-xyz')).toBe(true);
    });

    it('emits bot_activated to the room', async () => {
      await controller.activateBot('room-abc', 'player-xyz');
      expect(mockEmit).toHaveBeenCalledWith(
        'bot_activated',
        expect.objectContaining({ playerId: 'player-xyz' }),
      );
    });
  });

  describe('yieldBot', () => {
    it('removes bot from Redis HASH', async () => {
      await controller.activateBot('room-1', 'player-1');
      jest.clearAllMocks();
      await controller.yieldBot('room-1', 'player-1');
      expect(mockRedis.hdel).toHaveBeenCalledWith('bot:active:room-1', 'player-1');
    });

    it('removes bot from in-memory cache', async () => {
      await controller.activateBot('room-1', 'player-1');
      await controller.yieldBot('room-1', 'player-1');
      expect(controller.isBotActive('room-1', 'player-1')).toBe(false);
    });

    it('deletes bot:queue key', async () => {
      await controller.activateBot('room-1', 'player-1');
      jest.clearAllMocks();
      await controller.yieldBot('room-1', 'player-1');
      expect(mockRedis.del).toHaveBeenCalledWith('bot:queue:room-1:player-1');
    });

    it('emits bot_yielded to the room', async () => {
      await controller.activateBot('room-1', 'player-1');
      jest.clearAllMocks();
      await controller.yieldBot('room-1', 'player-1');
      expect(mockEmit).toHaveBeenCalledWith(
        'bot_yielded',
        expect.objectContaining({ playerId: 'player-1' }),
      );
    });
  });

  describe('scheduleAction', () => {
    it('sets bot:queue key in Redis with TTL', async () => {
      await controller.activateBot('room-1', 'player-1');
      jest.clearAllMocks();
      await controller.scheduleAction('room-1', 'player-1');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'bot:queue:room-1:player-1',
        'pending',
        'EX',
        expect.any(Number),
      );
    });

    it('uses a think time between 800 and 2500ms (verifies TTL)', async () => {
      await controller.activateBot('room-1', 'player-1');
      jest.clearAllMocks();

      // Capture TTL argument passed to redis.set
      let capturedTtl: number | undefined;
      (mockRedis.set as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
        capturedTtl = args[3] as number;
        return Promise.resolve('OK');
      });

      await controller.scheduleAction('room-1', 'player-1');

      // TTL covers think time plus a retry buffer; think time is 800–2500ms
      // and the controller adds +30s for retries → between 31 and 33 seconds.
      expect(capturedTtl).toBeGreaterThanOrEqual(31);
      expect(capturedTtl).toBeLessThanOrEqual(33);
    });
  });

  describe('deactivateAll', () => {
    it('removes all active bots for a room from Redis and cache', async () => {
      await controller.activateBot('room-2', 'player-a');
      await controller.activateBot('room-2', 'player-b');

      (mockRedis.hgetall as jest.Mock).mockResolvedValueOnce({
        'player-a': 'bot-instance-1',
        'player-b': 'bot-instance-2',
      });

      await controller.deactivateAll('room-2');

      expect(controller.isBotActive('room-2', 'player-a')).toBe(false);
      expect(controller.isBotActive('room-2', 'player-b')).toBe(false);
      expect(mockRedis.del).toHaveBeenCalledWith('bot:active:room-2');
    });
  });
});
