/**
 * Oh Hell Engine Tests
 */

import { OhHellEngine } from '../src/games/ohhell/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(playerCount = 3): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'ohhell',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i + 1}`),
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('OhHellEngine', () => {
  let engine: OhHellEngine;

  beforeEach(() => { engine = new OhHellEngine(); });

  it('has gameId = ohhell', () => {
    expect(engine.gameId).toBe('ohhell');
  });

  it('supports 3-6 players', () => {
    expect(engine.minPlayers).toBe(3);
    expect(engine.maxPlayers).toBe(6);
  });

  it('starts with 1 card dealt each (round 1)', () => {
    const state = engine.startGame(makeConfig(3));
    state.players.forEach(p => expect(p.hand).toHaveLength(1));
  });

  it('starts in playing phase', () => {
    expect(engine.startGame(makeConfig(3)).phase).toBe('playing');
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig(3)))).toBe(false);
  });

  it('computeResult returns rankings', () => {
    expect(engine.computeResult(engine.startGame(makeConfig(3)))).toHaveLength(3);
  });
});
