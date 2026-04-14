/**
 * Rummy Bot Strategy Tests
 */

import { RummyBotStrategy } from '../src/bots/strategies/rummy.strategy';
import { RummyEngine } from '../src/games/rummy/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(playerCount = 2): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'rummy',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i + 1}`),
    asyncMode: true,
    turnTimerSeconds: 90,
  };
}

describe('RummyBotStrategy', () => {
  let strategy: RummyBotStrategy;
  let engine: RummyEngine;

  beforeEach(() => {
    strategy = new RummyBotStrategy();
    engine = new RummyEngine();
  });

  it('has gameId = rummy', () => {
    expect(strategy.gameId).toBe('rummy');
  });

  it('chooseAction returns a valid action', () => {
    const state = engine.startGame(makeConfig(2));
    const botId = state.currentTurn!;
    const action = strategy.chooseAction(state, botId);
    expect(action).toBeTruthy();
    expect(typeof action.type).toBe('string');
  });

  it('fallbackAction never throws', () => {
    const state = engine.startGame(makeConfig(2));
    expect(() => strategy.fallbackAction(state, 'p1')).not.toThrow();
  });

  it('fallbackAction returns discard action with valid card', () => {
    const state = engine.startGame(makeConfig(2));
    const action = strategy.fallbackAction(state, 'p1');
    expect(action.type).toBe('discard');
    expect(action.cardIds).toHaveLength(1);
  });

  it('fallbackAction on empty hand returns pass', () => {
    const state = engine.startGame(makeConfig(2));
    const modState = {
      ...state,
      players: state.players.map(p =>
        p.playerId === 'p1' ? { ...p, hand: [] } : p
      ),
    };
    const action = strategy.fallbackAction(modState, 'p1');
    expect(action.type).toBe('pass');
  });
});
