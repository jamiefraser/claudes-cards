/**
 * Cribbage Bot Strategy Tests
 */

import { CribbageBotStrategy } from '../src/bots/strategies/cribbage.strategy';
import { CribbageEngine } from '../src/games/cribbage/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'cribbage',
    playerIds: ['p1', 'p2'],
    asyncMode: true,
    turnTimerSeconds: 90,
  };
}

describe('CribbageBotStrategy', () => {
  let strategy: CribbageBotStrategy;
  let engine: CribbageEngine;

  beforeEach(() => {
    strategy = new CribbageBotStrategy();
    engine = new CribbageEngine();
  });

  it('has gameId = cribbage', () => {
    expect(strategy.gameId).toBe('cribbage');
  });

  it('chooseAction returns a valid action', () => {
    const state = engine.startGame(makeConfig());
    const botId = state.players[0]!.playerId;
    const action = strategy.chooseAction(state, botId);
    expect(typeof action.type).toBe('string');
  });

  it('fallbackAction never throws', () => {
    const state = engine.startGame(makeConfig());
    expect(() => strategy.fallbackAction(state, 'p1')).not.toThrow();
  });

  it('fallbackAction returns an action', () => {
    const state = engine.startGame(makeConfig());
    const action = strategy.fallbackAction(state, 'p1');
    expect(action).toBeTruthy();
    expect(typeof action.type).toBe('string');
  });

  it('fallbackAction on empty hand returns pass', () => {
    const state = engine.startGame(makeConfig());
    const modState = { ...state, players: state.players.map(p => p.playerId === 'p1' ? { ...p, hand: [] } : p) };
    expect(strategy.fallbackAction(modState, 'p1').type).toBe('pass');
  });
});
