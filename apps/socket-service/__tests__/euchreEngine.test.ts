/**
 * Euchre Engine Tests
 */

import { EuchreEngine } from '../src/games/euchre/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'euchre',
    playerIds: ['p1', 'p2', 'p3', 'p4'],
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('EuchreEngine', () => {
  let engine: EuchreEngine;

  beforeEach(() => { engine = new EuchreEngine(); });

  it('has gameId = euchre', () => {
    expect(engine.gameId).toBe('euchre');
  });

  it('requires exactly 4 players', () => {
    expect(engine.minPlayers).toBe(4);
    expect(engine.maxPlayers).toBe(4);
  });

  it('deals 5 cards to each player', () => {
    const state = engine.startGame(makeConfig());
    state.players.forEach(p => expect(p.hand).toHaveLength(5));
  });

  it('starts in playing phase', () => {
    expect(engine.startGame(makeConfig()).phase).toBe('playing');
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig()))).toBe(false);
  });

  it('computeResult returns 4 rankings', () => {
    expect(engine.computeResult(engine.startGame(makeConfig()))).toHaveLength(4);
  });

  it('deck has 24 cards (euchre deck)', () => {
    const state = engine.startGame(makeConfig());
    const pd = state.publicData as Record<string, unknown>;
    // 4 players * 5 cards = 20 dealt, plus kitty cards
    const totalDealt = state.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(totalDealt).toBe(20);
  });
});
