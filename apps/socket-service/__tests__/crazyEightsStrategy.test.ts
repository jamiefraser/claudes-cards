/**
 * Crazy Eights Bot Strategy Tests
 */

import { CrazyEightsBotStrategy } from '../src/bots/strategies/crazyeights.strategy';
import { CrazyEightsEngine } from '../src/games/crazyeights/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'crazyeights',
    playerIds: ['p1', 'p2'],
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('CrazyEightsBotStrategy', () => {
  let strategy: CrazyEightsBotStrategy;
  let engine: CrazyEightsEngine;

  beforeEach(() => {
    strategy = new CrazyEightsBotStrategy();
    engine = new CrazyEightsEngine();
  });

  it('has gameId = crazyeights', () => {
    expect(strategy.gameId).toBe('crazyeights');
  });

  it('chooseAction returns a valid action', () => {
    const state = engine.startGame(makeConfig());
    const action = strategy.chooseAction(state, state.currentTurn!);
    expect(typeof action.type).toBe('string');
  });

  it('fallbackAction never throws', () => {
    const state = engine.startGame(makeConfig());
    expect(() => strategy.fallbackAction(state, 'p1')).not.toThrow();
  });

  it('fallbackAction returns draw or play action', () => {
    const state = engine.startGame(makeConfig());
    const action = strategy.fallbackAction(state, 'p1');
    expect(['draw', 'play', 'pass']).toContain(action.type);
  });
});
