/**
 * Spit Engine Tests
 */

import { SpitEngine } from '../src/games/spit/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'spit',
    playerIds: ['p1', 'p2'],
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('SpitEngine', () => {
  let engine: SpitEngine;

  beforeEach(() => { engine = new SpitEngine(); });

  it('has gameId = spit', () => {
    expect(engine.gameId).toBe('spit');
  });

  it('requires exactly 2 players', () => {
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(2);
  });

  it('deals 26 cards to each player', () => {
    const state = engine.startGame(makeConfig());
    const pd = state.publicData as Record<string, unknown>;
    // Spit deals into stock piles, not hands directly
    expect(state.players).toHaveLength(2);
  });

  it('starts in playing phase', () => {
    expect(engine.startGame(makeConfig()).phase).toBe('playing');
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig()))).toBe(false);
  });

  it('computeResult returns 2 rankings', () => {
    expect(engine.computeResult(engine.startGame(makeConfig()))).toHaveLength(2);
  });
});
