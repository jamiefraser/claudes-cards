/**
 * Gin Rummy Bot Strategy Tests
 */

import { GinRummyBotStrategy } from '../src/bots/strategies/ginrummy.strategy';
import { GinRummyEngine } from '../src/games/ginrummy/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'ginrummy',
    playerIds: ['p1', 'p2'],
    asyncMode: true,
    turnTimerSeconds: 90,
  };
}

describe('GinRummyBotStrategy', () => {
  let strategy: GinRummyBotStrategy;
  let engine: GinRummyEngine;

  beforeEach(() => {
    strategy = new GinRummyBotStrategy();
    engine = new GinRummyEngine();
  });

  it('has gameId = ginrummy', () => {
    expect(strategy.gameId).toBe('ginrummy');
  });

  it('chooseAction returns a valid action type', () => {
    const state = engine.startGame(makeConfig());
    const action = strategy.chooseAction(state, state.currentTurn!);
    expect(typeof action.type).toBe('string');
  });

  it('fallbackAction never throws', () => {
    const state = engine.startGame(makeConfig());
    expect(() => strategy.fallbackAction(state, 'p1')).not.toThrow();
  });

  it('fallbackAction returns discard when hand has cards', () => {
    const state = engine.startGame(makeConfig());
    const action = strategy.fallbackAction(state, 'p1');
    expect(action.type).toBe('discard');
  });

  it('fallbackAction returns pass when hand is empty', () => {
    const state = engine.startGame(makeConfig());
    const modState = { ...state, players: state.players.map(p => p.playerId === 'p1' ? { ...p, hand: [] } : p) };
    expect(strategy.fallbackAction(modState, 'p1').type).toBe('pass');
  });
});
