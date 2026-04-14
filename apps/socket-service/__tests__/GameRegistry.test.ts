/**
 * GameRegistry Tests
 *
 * Tests for the GameRegistry singleton: register engines and strategies,
 * retrieve them by gameId, and handle unknown game IDs.
 */

import { GameRegistry } from '../src/games/registry';
import type { IGameEngine } from '@card-platform/shared-types';
import type { IBotStrategy } from '@card-platform/shared-types';
import type { GameState, PlayerAction } from '@card-platform/shared-types';

function makeEngine(gameId: string): IGameEngine {
  return {
    gameId,
    supportsAsync: true,
    minPlayers: 2,
    maxPlayers: 6,
    startGame: jest.fn().mockReturnValue({ version: 1, roomId: 'r1', gameId } as unknown as GameState),
    applyAction: jest.fn(),
    getValidActions: jest.fn().mockReturnValue([]),
    computeResult: jest.fn().mockReturnValue([]),
    isGameOver: jest.fn().mockReturnValue(false),
  };
}

function makeStrategy(gameId: string): IBotStrategy {
  return {
    gameId,
    chooseAction: jest.fn().mockReturnValue({ type: 'draw' } as PlayerAction),
    fallbackAction: jest.fn().mockReturnValue({ type: 'discard' } as PlayerAction),
  };
}

describe('GameRegistry', () => {
  let registry: GameRegistry;

  beforeEach(() => {
    registry = new GameRegistry();
  });

  it('registers an engine and retrieves it by gameId', () => {
    const engine = makeEngine('phase10');
    registry.register(engine);
    expect(registry.getEngine('phase10')).toBe(engine);
  });

  it('registers an engine with a strategy and retrieves both', () => {
    const engine = makeEngine('rummy');
    const strategy = makeStrategy('rummy');
    registry.register(engine, strategy);
    expect(registry.getEngine('rummy')).toBe(engine);
    expect(registry.getStrategy('rummy')).toBe(strategy);
  });

  it('throws when getting an engine for an unknown gameId', () => {
    expect(() => registry.getEngine('unknown-game')).toThrow();
  });

  it('returns undefined (not throws) when getting a strategy for a game without one', () => {
    const engine = makeEngine('gofish');
    registry.register(engine);
    // No strategy registered — should return undefined
    expect(registry.getStrategy('gofish')).toBeUndefined();
  });

  it('overwrites an engine when registered twice with same gameId', () => {
    const engine1 = makeEngine('spades');
    const engine2 = makeEngine('spades');
    registry.register(engine1);
    registry.register(engine2);
    expect(registry.getEngine('spades')).toBe(engine2);
  });

  it('can register multiple engines independently', () => {
    const e1 = makeEngine('hearts');
    const e2 = makeEngine('spades');
    registry.register(e1);
    registry.register(e2);
    expect(registry.getEngine('hearts')).toBe(e1);
    expect(registry.getEngine('spades')).toBe(e2);
  });

  // --- Normalization: kebab-case and one-word forms resolve to the same engine ---

  it("resolves 'gin-rummy' (kebab) to the 'ginrummy' engine", () => {
    const registry = new GameRegistry();
    const engine = makeEngine('ginrummy');
    registry.register(engine);
    expect(registry.getEngine('gin-rummy')).toBe(engine);
    expect(registry.getEngine('ginrummy')).toBe(engine);
  });

  it("resolves 'crazy-eights', 'go-fish', 'oh-hell' to their engines", () => {
    const registry = new GameRegistry();
    const crazy = makeEngine('crazyeights');
    const fish = makeEngine('gofish');
    const hell = makeEngine('ohhell');
    registry.register(crazy);
    registry.register(fish);
    registry.register(hell);
    expect(registry.getEngine('crazy-eights')).toBe(crazy);
    expect(registry.getEngine('go-fish')).toBe(fish);
    expect(registry.getEngine('oh-hell')).toBe(hell);
  });

  it('unknown gameIds still throw with a useful message', () => {
    const registry = new GameRegistry();
    registry.register(makeEngine('hearts'));
    expect(() => registry.getEngine('bridge')).toThrow(/No engine registered/);
  });
});
