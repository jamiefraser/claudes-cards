/**
 * Go Fish Bot Strategy Tests
 */

import { GoFishBotStrategy } from '../src/bots/strategies/gofish.strategy';
import { GoFishEngine } from '../src/games/gofish/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'gofish',
    playerIds: ['p1', 'p2'],
    asyncMode: true,
    turnTimerSeconds: 60,
  };
}

describe('GoFishBotStrategy', () => {
  let strategy: GoFishBotStrategy;
  let engine: GoFishEngine;

  beforeEach(() => {
    strategy = new GoFishBotStrategy();
    engine = new GoFishEngine();
  });

  it('has gameId = gofish', () => {
    expect(strategy.gameId).toBe('gofish');
  });

  it('chooseAction returns ask action', () => {
    const state = engine.startGame(makeConfig());
    const action = strategy.chooseAction(state, state.currentTurn!);
    expect(action.type).toBe('ask');
  });

  it('fallbackAction never throws', () => {
    const state = engine.startGame(makeConfig());
    expect(() => strategy.fallbackAction(state, 'p1')).not.toThrow();
  });

  it('fallbackAction returns valid action', () => {
    const state = engine.startGame(makeConfig());
    const action = strategy.fallbackAction(state, 'p1');
    expect(typeof action.type).toBe('string');
  });
});
