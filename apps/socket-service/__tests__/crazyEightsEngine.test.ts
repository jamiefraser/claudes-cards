/**
 * Crazy Eights Engine Tests
 */

import { CrazyEightsEngine } from '../src/games/crazyeights/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(playerCount = 2): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'crazyeights',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i + 1}`),
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('CrazyEightsEngine', () => {
  let engine: CrazyEightsEngine;

  beforeEach(() => { engine = new CrazyEightsEngine(); });

  it('has gameId = crazyeights', () => {
    expect(engine.gameId).toBe('crazyeights');
  });

  it('deals 7 cards each for 2-player', () => {
    const state = engine.startGame(makeConfig(2));
    state.players.forEach(p => expect(p.hand).toHaveLength(7));
  });

  it('deals 5 cards each for 4-player', () => {
    const state = engine.startGame(makeConfig(4));
    state.players.forEach(p => expect(p.hand).toHaveLength(5));
  });

  it('starts in playing phase', () => {
    expect(engine.startGame(makeConfig(2)).phase).toBe('playing');
  });

  it('has a discard top after deal', () => {
    const pd = engine.startGame(makeConfig(2)).publicData as Record<string, unknown>;
    expect(pd.discardTop).toBeTruthy();
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig(2)))).toBe(false);
  });

  it('computeResult returns rankings', () => {
    expect(engine.computeResult(engine.startGame(makeConfig(2)))).toHaveLength(2);
  });

  it('getValidActions for current player includes play or draw', () => {
    const state = engine.startGame(makeConfig(2));
    const actions = engine.getValidActions(state, state.currentTurn!);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('rejects play from wrong player', () => {
    const state = engine.startGame(makeConfig(2));
    const other = state.players.find(p => p.playerId !== state.currentTurn)!;
    expect(() => engine.applyAction(state, other.playerId, { type: 'draw' })).toThrow();
  });

  // -------------------------------------------------------------------------
  // Hoyle's Crazy Eights (Hoyle's "Eights").
  // -------------------------------------------------------------------------

  it("deal size: 7 for 2 players, 5 for 3+ (Hoyle's)", () => {
    expect(engine.startGame(makeConfig(2)).players[0]!.hand.length).toBe(7);
    expect(engine.startGame(makeConfig(3)).players[0]!.hand.length).toBe(5);
  });

  it('starting discard is never an 8 (avoids unfair wild on start)', () => {
    for (let i = 0; i < 20; i++) {
      const s = engine.startGame(makeConfig(2));
      const pd = s.publicData as Record<string, unknown>;
      const top = pd['discardTop'] as { rank?: string };
      expect(top.rank).not.toBe('8');
    }
  });

  it('any 8 is a valid play regardless of rank/suit match', () => {
    const state = engine.startGame(makeConfig(2));
    const pd = state.publicData as Record<string, unknown>;
    const top = pd['discardTop'] as { suit: string };

    const pid = state.currentTurn!;
    const otherSuit = (['hearts','diamonds','clubs','spades'] as const).find(
      (s) => s !== top.suit,
    )!;
    const eight = {
      id: 'e8',
      deckType: 'standard' as const,
      rank: '8' as const,
      suit: otherSuit,
      value: 8,
      faceUp: false,
    };
    const withEight = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === pid ? { ...p, hand: [eight, ...p.hand] } : p,
      ),
    };
    expect(() =>
      engine.applyAction(withEight, pid, {
        type: 'play',
        cardIds: ['e8'],
        payload: { declaredSuit: otherSuit },
      }),
    ).not.toThrow();
  });

  it('initial draw-pile size = 52 \u2212 dealt \u2212 1 starter', () => {
    const state = engine.startGame(makeConfig(2));
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['drawPileSize']).toBe(52 - 2 * 7 - 1);
  });

  // -------------------------------------------------------------------------
  // Hoyle's Crazy Eights rule suite (added April 2026).
  // -------------------------------------------------------------------------

  it("Hoyle's deal: 7 cards for 2 players, 5 for 3+", () => {
    const two = engine.startGame(makeConfig(2));
    for (const p of two.players) expect(p.hand.length).toBe(7);
    const four = engine.startGame(makeConfig(4));
    for (const p of four.players) expect(p.hand.length).toBe(5);
  });

  it('opening discard is never an 8', () => {
    for (let i = 0; i < 20; i++) {
      const s = engine.startGame(makeConfig(2));
      const pd = s.publicData as Record<string, unknown>;
      const top = pd['discardTop'] as { rank?: string };
      expect(top.rank).not.toBe('8');
    }
  });

  it('8 is always playable (wild) regardless of top card', () => {
    const start = engine.startGame(makeConfig(2));
    const playerId = start.currentTurn!;
    const player = start.players.find((p) => p.playerId === playerId)!;
    const eight = {
      id: 'wild-8',
      deckType: 'standard' as const,
      rank: '8' as const,
      suit: 'clubs' as const,
      value: 8,
      faceUp: false,
    };
    const state = {
      ...start,
      players: start.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: [eight, ...player.hand] } : p,
      ),
      publicData: {
        ...start.publicData,
        discardTop: {
          id: 'top',
          deckType: 'standard',
          rank: 'K',
          suit: 'hearts',
          value: 13,
          faceUp: true,
        },
      },
    };
    const after = engine.applyAction(state, playerId, {
      type: 'play',
      cardIds: ['wild-8'],
      payload: { declaredSuit: 'diamonds' },
    });
    expect(after.version).toBe(state.version + 1);
  });
});
