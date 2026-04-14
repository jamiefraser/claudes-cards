/**
 * Idiot (Palace/Shithead) Engine Tests
 */

import { IdiotEngine } from '../src/games/idiot/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(playerCount = 2): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'idiot',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i + 1}`),
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('IdiotEngine', () => {
  let engine: IdiotEngine;

  beforeEach(() => { engine = new IdiotEngine(); });

  it('has gameId = idiot', () => {
    expect(engine.gameId).toBe('idiot');
  });

  it('supports 2-6 players', () => {
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(6);
  });

  it('deals cards at start', () => {
    const state = engine.startGame(makeConfig(2));
    // Each player has 3 face-down, 3 face-up table cards, 3 hand cards
    expect(state.players.length).toBe(2);
  });

  it('starts in playing phase', () => {
    expect(engine.startGame(makeConfig(2)).phase).toBe('playing');
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig(2)))).toBe(false);
  });

  it('computeResult returns rankings', () => {
    expect(engine.computeResult(engine.startGame(makeConfig(2)))).toHaveLength(2);
  });
});
