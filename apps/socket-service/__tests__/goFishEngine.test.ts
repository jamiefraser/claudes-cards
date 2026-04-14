/**
 * Go Fish Engine Tests
 */

import { GoFishEngine } from '../src/games/gofish/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(playerCount = 2): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'gofish',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i + 1}`),
    asyncMode: true,
    turnTimerSeconds: 60,
  };
}

describe('GoFishEngine', () => {
  let engine: GoFishEngine;

  beforeEach(() => { engine = new GoFishEngine(); });

  it('has gameId = gofish', () => {
    expect(engine.gameId).toBe('gofish');
  });

  it('deals 7 cards to each player for 2-player', () => {
    const state = engine.startGame(makeConfig(2));
    state.players.forEach(p => expect(p.hand).toHaveLength(7));
  });

  it('deals 5 cards to each player for 4-player', () => {
    const state = engine.startGame(makeConfig(4));
    state.players.forEach(p => expect(p.hand).toHaveLength(5));
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

  it('getValidActions returns ask action for current player', () => {
    const state = engine.startGame(makeConfig(2));
    const actions = engine.getValidActions(state, state.currentTurn!);
    expect(actions.some(a => a.type === 'ask')).toBe(true);
  });

  it('rejects ask action from wrong player', () => {
    const state = engine.startGame(makeConfig(2));
    const other = state.players.find(p => p.playerId !== state.currentTurn)!;
    expect(() => engine.applyAction(state, other.playerId, {
      type: 'ask',
      payload: { targetPlayerId: state.currentTurn!, rank: 'A' }
    })).toThrow();
  });

  // -------------------------------------------------------------------------
  // Hoyle's Go Fish (also called Authors).
  // -------------------------------------------------------------------------

  it("deal size: 7 for 2 players, 5 for 3\u20136 (Hoyle's)", () => {
    const two = engine.startGame(makeConfig(2));
    for (const p of two.players) {
      // Books formed at deal reduce hand size by 4 per book \u2014 at 7 cards,
      // at most 1 book is possible. So hand size is 7 or 3.
      expect([7, 3]).toContain(p.hand.length);
    }
    const four = engine.startGame(makeConfig(4));
    for (const p of four.players) {
      expect([5, 1]).toContain(p.hand.length);
    }
  });

  it('completed book (4 of a rank) is set aside and scores 1 point', () => {
    // Build a controlled 2-player state with p1 holding 3 Aces and p2 holding 1 Ace.
    const cfg = makeConfig(2);
    const start = engine.startGame(cfg);
    const ace1 = { id: 'a1', deckType: 'standard' as const, rank: 'A' as const, suit: 'hearts' as const, value: 1, faceUp: false };
    const ace2 = { id: 'a2', deckType: 'standard' as const, rank: 'A' as const, suit: 'spades' as const, value: 1, faceUp: false };
    const ace3 = { id: 'a3', deckType: 'standard' as const, rank: 'A' as const, suit: 'clubs' as const, value: 1, faceUp: false };
    const ace4 = { id: 'a4', deckType: 'standard' as const, rank: 'A' as const, suit: 'diamonds' as const, value: 1, faceUp: false };
    const filler = (id: string) => ({ id, deckType: 'standard' as const, rank: '2' as const, suit: 'hearts' as const, value: 2, faceUp: false });
    const state = {
      ...start,
      currentTurn: 'p1',
      players: [
        { ...start.players[0]!, hand: [ace1, ace2, ace3, filler('f1')] },
        { ...start.players[1]!, hand: [ace4, filler('f2'), filler('f3'), filler('f4')] },
      ],
    };

    const after = engine.applyAction(state, 'p1', {
      type: 'ask',
      payload: { targetPlayerId: 'p2', rank: 'A' },
    });

    const p1After = after.players.find((p) => p.playerId === 'p1')!;
    expect(p1After.score).toBe(1); // 1 book scored
    // All four aces should be gone from p1's hand (book set aside).
    expect(p1After.hand.filter((c) => c.rank === 'A').length).toBe(0);
  });
});
