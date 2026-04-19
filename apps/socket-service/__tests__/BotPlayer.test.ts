/**
 * BotPlayer Tests
 *
 * Tests for executeAction:
 * - Happy path: acquires lock, gets state, chooses action, applies it, emits delta
 * - Abort: bot:active missing
 * - Abort: bot:queue missing
 * - Fallback chain: chooseAction throws → fallbackAction
 * - Fallback chain: both throw → rightmost discard
 */

jest.mock('../src/redis/client', () => ({
  redis: {
    hexists: jest.fn(),
    exists: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    rpush: jest.fn().mockResolvedValue(1),
    hset: jest.fn().mockResolvedValue(1),
    hdel: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../src/redis/pubsub', () => ({
  redisSub: {
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  },
}));

// emitFilteredDelta walks `nsp.in(roomId).fetchSockets()` and calls
// `s.emit(...)` per recipient. Expose a one-socket fan-out so these
// tests can still assert the bot emitted a delta. `mockEmit` stays wired
// to that one fake socket.
const mockEmit = jest.fn();
const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
const fakeSocket = {
  data: { user: { playerId: 'observer' } },
  emit: mockEmit,
};
const mockFetchSockets = jest.fn().mockResolvedValue([fakeSocket]);
const mockIn = jest.fn().mockReturnValue({ fetchSockets: mockFetchSockets });

jest.mock('../src/index', () => ({
  getIO: jest.fn().mockReturnValue({
    of: jest.fn().mockReturnValue({ to: mockTo, in: mockIn }),
  }),
}));

import { BotPlayer } from '../src/bots/BotPlayer';
import { GameRegistry } from '../src/games/registry';
import { BotController } from '../src/bots/BotController';
import { redis } from '../src/redis/client';
import type { GameState, PlayerAction, IBotStrategy, IGameEngine } from '@card-platform/shared-types';

const mockRedis = redis as jest.Mocked<typeof redis>;

function makeGameState(overrides?: Partial<GameState>): GameState {
  return {
    version: 1,
    roomId: 'room-1',
    gameId: 'generic',
    phase: 'playing',
    players: [
      {
        playerId: 'bot-player',
        displayName: 'Bot',
        hand: [
          { id: 'c1', suit: 'hearts', rank: '2', deckType: 'standard', value: 2, faceUp: false },
          { id: 'c2', suit: 'spades', rank: 'K', deckType: 'standard', value: 13, faceUp: false },
        ],
        score: 0,
        isOut: false,
        isBot: true,
      },
    ],
    currentTurn: 'bot-player',
    turnNumber: 1,
    roundNumber: 1,
    publicData: {},
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEngine(gameId = 'generic'): IGameEngine {
  const state = makeGameState({ gameId });
  return {
    gameId,
    supportsAsync: true,
    minPlayers: 2,
    maxPlayers: 6,
    startGame: jest.fn().mockReturnValue(state),
    applyAction: jest.fn().mockImplementation((_s: GameState, _p: string, _a: PlayerAction) => ({
      ...state,
      version: state.version + 1,
    })),
    getValidActions: jest.fn().mockReturnValue([{ type: 'draw' }]),
    computeResult: jest.fn().mockReturnValue([]),
    isGameOver: jest.fn().mockReturnValue(false),
  };
}

function makeStrategy(gameId = 'generic', opts?: { throwChoose?: boolean; throwFallback?: boolean }): IBotStrategy {
  return {
    gameId,
    chooseAction: opts?.throwChoose
      ? jest.fn().mockImplementation(() => { throw new Error('choose failed'); })
      : jest.fn().mockReturnValue({ type: 'draw' } as PlayerAction),
    fallbackAction: opts?.throwFallback
      ? jest.fn().mockImplementation(() => { throw new Error('fallback failed'); })
      : jest.fn().mockReturnValue({ type: 'discard', cardIds: ['c1'] } as PlayerAction),
  };
}

describe('BotPlayer.executeAction', () => {
  let registry: GameRegistry;
  let botController: BotController;
  let botPlayer: BotPlayer;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new GameRegistry();
    botController = new BotController();
    botPlayer = new BotPlayer(registry, botController);
  });

  it('happy path: acquires lock, applies action, emits game_state_delta', async () => {
    const engine = makeEngine('generic');
    const strategy = makeStrategy('generic');
    registry.register(engine, strategy);

    const state = makeGameState();

    // bot:active HEXISTS → 1 (bot is active)
    (mockRedis.hexists as jest.Mock).mockResolvedValue(1);
    // bot:queue EXISTS → 1 (queue key exists)
    (mockRedis.exists as jest.Mock).mockResolvedValue(1);
    // SET NX for lock → OK
    (mockRedis.set as jest.Mock).mockResolvedValueOnce('OK');
    // GET game:state → serialised state
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(state));
    // SET game:state → OK
    (mockRedis.set as jest.Mock).mockResolvedValue('OK');

    await botPlayer.executeAction('room-1', 'bot-player');

    expect(engine.applyAction).toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith('game_state_delta', expect.objectContaining({ delta: expect.any(Object) }));
    // Lock should be released
    expect(mockRedis.del).toHaveBeenCalledWith('game:lock:room-1');
  });

  it('aborts when bot:active HEXISTS returns 0', async () => {
    const engine = makeEngine('generic');
    registry.register(engine);

    (mockRedis.hexists as jest.Mock).mockResolvedValue(0);

    await botPlayer.executeAction('room-1', 'bot-player');

    expect(engine.applyAction).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('aborts when bot:queue does not exist', async () => {
    const engine = makeEngine('generic');
    registry.register(engine);

    (mockRedis.hexists as jest.Mock).mockResolvedValue(1);
    (mockRedis.exists as jest.Mock).mockResolvedValue(0);

    await botPlayer.executeAction('room-1', 'bot-player');

    expect(engine.applyAction).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('calls fallbackAction when chooseAction throws', async () => {
    const engine = makeEngine('generic');
    const strategy = makeStrategy('generic', { throwChoose: true });
    registry.register(engine, strategy);

    const state = makeGameState();
    (mockRedis.hexists as jest.Mock).mockResolvedValue(1);
    (mockRedis.exists as jest.Mock).mockResolvedValue(1);
    (mockRedis.set as jest.Mock).mockResolvedValue('OK');
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(state));

    await botPlayer.executeAction('room-1', 'bot-player');

    expect(strategy.fallbackAction).toHaveBeenCalled();
    expect(engine.applyAction).toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith('game_state_delta', expect.any(Object));
  });

  it('uses rightmost card discard when both chooseAction and fallbackAction throw', async () => {
    const engine = makeEngine('generic');
    const strategy = makeStrategy('generic', { throwChoose: true, throwFallback: true });
    registry.register(engine, strategy);

    const state = makeGameState();
    (mockRedis.hexists as jest.Mock).mockResolvedValue(1);
    (mockRedis.exists as jest.Mock).mockResolvedValue(1);
    (mockRedis.set as jest.Mock).mockResolvedValue('OK');
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(state));

    await botPlayer.executeAction('room-1', 'bot-player');

    // Should have used the rightmost card (c2) as discard
    expect(engine.applyAction).toHaveBeenCalledWith(
      expect.anything(),
      'bot-player',
      expect.objectContaining({ type: 'discard', cardIds: ['c2'] }),
    );
  });

  it('falls back to rightmost discard when the engine rejects the strategy action', async () => {
    // Simulate an engine that rejects the strategy's 'draw' action but
    // accepts the rightmost-discard fallback. Without the BotPlayer catch
    // around applyAction, the exception would propagate and leave bot:queue
    // alive → the sweeper would replay the same failing action indefinitely.
    const engine = makeEngine('generic');
    let call = 0;
    (engine.applyAction as jest.Mock).mockImplementation(() => {
      call += 1;
      if (call === 1) throw new Error('not allowed in this phase');
      return { ...makeGameState(), version: 2 };
    });
    const strategy = makeStrategy('generic');
    registry.register(engine, strategy);

    const state = makeGameState();
    (mockRedis.hexists as jest.Mock).mockResolvedValue(1);
    (mockRedis.exists as jest.Mock).mockResolvedValue(1);
    (mockRedis.set as jest.Mock).mockResolvedValue('OK');
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(state));

    await botPlayer.executeAction('room-1', 'bot-player');

    // First attempt was the strategy's draw; second attempt must be the
    // rightmost-discard fallback (c2 is rightmost in the test hand).
    expect(engine.applyAction).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'bot-player',
      expect.objectContaining({ type: 'discard', cardIds: ['c2'] }),
    );
    // bot:queue and bot:schedule must be cleared so the sweeper doesn't
    // re-fire after we've already succeeded on the fallback path.
    expect(mockRedis.del).toHaveBeenCalledWith('bot:queue:room-1:bot-player');
    expect(mockRedis.del).toHaveBeenCalledWith('bot:schedule:room-1:bot-player');
  });

  it('force-passes (clears keys) when rightmost discard is also rejected', async () => {
    const engine = makeEngine('generic');
    (engine.applyAction as jest.Mock).mockImplementation(() => {
      throw new Error('nothing works');
    });
    const strategy = makeStrategy('generic');
    registry.register(engine, strategy);

    const state = makeGameState();
    (mockRedis.hexists as jest.Mock).mockResolvedValue(1);
    (mockRedis.exists as jest.Mock).mockResolvedValue(1);
    (mockRedis.set as jest.Mock).mockResolvedValue('OK');
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(state));

    await botPlayer.executeAction('room-1', 'bot-player');

    // No state update / no game_state_delta — but keys cleared so the sweeper
    // won't spin.
    expect(mockEmit).not.toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalledWith('bot:queue:room-1:bot-player');
    expect(mockRedis.del).toHaveBeenCalledWith('bot:schedule:room-1:bot-player');
    // Lock always released.
    expect(mockRedis.del).toHaveBeenCalledWith('game:lock:room-1');
  });

  it('aborts gracefully when lock cannot be acquired (returns null)', async () => {
    const engine = makeEngine('generic');
    registry.register(engine);

    (mockRedis.hexists as jest.Mock).mockResolvedValue(1);
    (mockRedis.exists as jest.Mock).mockResolvedValue(1);
    // Lock fails (another server holds it)
    (mockRedis.set as jest.Mock).mockResolvedValue(null);

    await botPlayer.executeAction('room-1', 'bot-player');

    expect(engine.applyAction).not.toHaveBeenCalled();
  });
});
