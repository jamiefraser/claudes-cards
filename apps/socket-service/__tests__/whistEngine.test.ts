/**
 * Whist Engine Tests
 */

import { WhistEngine } from '../src/games/whist/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'whist',
    playerIds: ['p1', 'p2', 'p3', 'p4'],
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('WhistEngine', () => {
  let engine: WhistEngine;

  beforeEach(() => { engine = new WhistEngine(); });

  it('has gameId = whist', () => {
    expect(engine.gameId).toBe('whist');
  });

  it('requires 4 players', () => {
    expect(engine.minPlayers).toBe(4);
    expect(engine.maxPlayers).toBe(4);
  });

  it('deals 13 cards to each player', () => {
    const state = engine.startGame(makeConfig());
    state.players.forEach(p => expect(p.hand).toHaveLength(13));
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
});
