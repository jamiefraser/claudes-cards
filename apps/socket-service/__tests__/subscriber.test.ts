/**
 * PubSub Subscriber Tests
 *
 * Tests the Redis pub/sub message routing.
 */

jest.mock('../src/redis/client', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../src/redis/pubsub', () => {
  const listeners: Record<string, Function[]> = {};
  return {
    redisSub: {
      psubscribe: jest.fn().mockImplementation((_pattern: string, cb: Function) => {
        cb(null);
        return Promise.resolve();
      }),
      on: jest.fn().mockImplementation((event: string, handler: Function) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }),
      emit: (event: string, ...args: unknown[]) => {
        if (listeners[event]) {
          listeners[event].forEach((h) => h(...args));
        }
      },
    },
    __listeners: listeners,
  };
});

import { setupPubSubSubscriber } from '../src/pubsub/subscriber';
import type { BotController } from '../src/bots/BotController';

function makeIO() {
  const emitToRoom = jest.fn();
  const emitGlobal = jest.fn();
  const to = jest.fn().mockReturnValue({ emit: emitToRoom });
  return {
    io: {
      of: jest.fn().mockReturnValue({ to, emit: emitGlobal }),
    } as unknown as import('socket.io').Server,
    emitToRoom,
    emitGlobal,
    to,
  };
}

function makeBotController(): jest.Mocked<BotController> {
  return {
    activateBot: jest.fn().mockResolvedValue(undefined),
    yieldBot: jest.fn().mockResolvedValue(undefined),
    scheduleAction: jest.fn().mockResolvedValue(undefined),
    deactivateAll: jest.fn().mockResolvedValue(undefined),
    isBotActive: jest.fn().mockReturnValue(false),
    hydrateFromRedis: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<BotController>;
}

describe('setupPubSubSubscriber', () => {
  it('subscribes to all three patterns', () => {
    const { redisSub } = require('../src/redis/pubsub') as { redisSub: { psubscribe: jest.Mock } };
    const { io } = makeIO();
    const bc = makeBotController();

    setupPubSubSubscriber(io, bc);

    expect(redisSub.psubscribe).toHaveBeenCalledWith('bot:action:*', expect.any(Function));
    expect(redisSub.psubscribe).toHaveBeenCalledWith('room:event:*', expect.any(Function));
    expect(redisSub.psubscribe).toHaveBeenCalledWith('leaderboard:updated:*', expect.any(Function));
  });

  it('routes bot:action:* to botController.activateBot', () => {
    const { redisSub, __listeners } = require('../src/redis/pubsub') as {
      redisSub: { psubscribe: jest.Mock; on: jest.Mock };
      __listeners: Record<string, Function[]>;
    };
    const { io } = makeIO();
    const bc = makeBotController();

    setupPubSubSubscriber(io, bc);

    // Trigger pmessage
    const pmessageHandlers = __listeners['pmessage'];
    if (pmessageHandlers && pmessageHandlers.length > 0) {
      pmessageHandlers.forEach((h) =>
        h('bot:action:*', 'bot:action:room-xyz', JSON.stringify({ playerId: 'player-1' })),
      );
    }

    // activateBot(roomId, playerId, seatIndex). Subscriber defaults seatIndex=0.
    expect(bc.activateBot).toHaveBeenCalledWith('room-xyz', 'player-1', 0);
  });

  it('routes leaderboard:updated:* to /lobby emit', () => {
    const { __listeners } = require('../src/redis/pubsub') as {
      __listeners: Record<string, Function[]>;
    };
    const { io, emitGlobal } = makeIO();
    const bc = makeBotController();

    setupPubSubSubscriber(io, bc);

    const pmessageHandlers = __listeners['pmessage'];
    if (pmessageHandlers && pmessageHandlers.length > 0) {
      pmessageHandlers.forEach((h) =>
        h(
          'leaderboard:updated:*',
          'leaderboard:updated:phase10',
          JSON.stringify({ entries: [] }),
        ),
      );
    }

    expect(emitGlobal).toHaveBeenCalledWith(
      'leaderboard_updated',
      expect.objectContaining({ gameId: 'phase10' }),
    );
  });

  it('handles invalid JSON gracefully in bot:action', () => {
    const { __listeners } = require('../src/redis/pubsub') as {
      __listeners: Record<string, Function[]>;
    };
    const { io } = makeIO();
    const bc = makeBotController();

    setupPubSubSubscriber(io, bc);

    const pmessageHandlers = __listeners['pmessage'];
    expect(() => {
      if (pmessageHandlers && pmessageHandlers.length > 0) {
        pmessageHandlers.forEach((h) =>
          h('bot:action:*', 'bot:action:room-1', 'not-valid-json'),
        );
      }
    }).not.toThrow();

    expect(bc.activateBot).not.toHaveBeenCalled();
  });

  it('routes room:event:* to /lobby room', () => {
    const { __listeners } = require('../src/redis/pubsub') as {
      __listeners: Record<string, Function[]>;
    };
    const { io, emitToRoom, to } = makeIO();
    const bc = makeBotController();

    setupPubSubSubscriber(io, bc);

    const pmessageHandlers = __listeners['pmessage'];
    if (pmessageHandlers && pmessageHandlers.length > 0) {
      pmessageHandlers.forEach((h) =>
        h('room:event:*', 'room:event:room-abc', JSON.stringify({ type: 'player_joined' })),
      );
    }

    expect(to).toHaveBeenCalledWith('room:room-abc');
    expect(emitToRoom).toHaveBeenCalledWith('room_event', expect.any(Object));
  });
});
