/**
 * Oh Hell! — platform adapter tests.
 *
 * Thin — the pure core is exhaustively covered in ohhell-core.test.ts.
 */

import { OhHellEngine } from '../src/games/ohhell/engine';
import type { GameConfig, PlayerAction } from '@card-platform/shared-types';

function makeConfig(playerCount = 3, roomId = 'room-1'): GameConfig {
  return {
    roomId,
    gameId: 'ohhell',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i}`),
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('OhHellEngine — adapter', () => {
  let engine: OhHellEngine;
  beforeEach(() => { engine = new OhHellEngine(); });

  it('advertises gameId and 3–7 player range', () => {
    expect(engine.gameId).toBe('ohhell');
    expect(engine.minPlayers).toBe(3);
    expect(engine.maxPlayers).toBe(7);
    expect(engine.supportsAsync).toBe(false);
  });

  it('rejects configs outside 3–7 players', () => {
    expect(() => engine.startGame({ ...makeConfig(3), playerIds: ['a', 'b'] })).toThrow();
    expect(() =>
      engine.startGame({
        ...makeConfig(3),
        playerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      }),
    ).toThrow();
  });

  it('round 1 deals 1 card per player (upDown default)', () => {
    for (const n of [3, 4, 5, 6, 7]) {
      const state = engine.startGame(makeConfig(n));
      for (const p of state.players) expect(p.hand).toHaveLength(1);
    }
  });

  it('starts in playing phase with bid phase active', () => {
    const state = engine.startGame(makeConfig(4));
    expect(state.phase).toBe('playing');
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['phase']).toBe('bid');
    expect(pd['roundNumber']).toBe(1);
    expect(pd['handSize']).toBe(1);
  });

  it('same roomId yields the same deal (deterministic via roomId hash)', () => {
    const a = engine.startGame(makeConfig(4, 'deterministic'));
    const b = engine.startGame(makeConfig(4, 'deterministic'));
    for (let i = 0; i < 4; i++) {
      expect(a.players[i]!.hand.map((c) => c.id))
        .toEqual(b.players[i]!.hand.map((c) => c.id));
    }
  });

  it('publicData exposes bids, tricks, dealer, trump, turnUp, forbiddenBids', () => {
    const state = engine.startGame(makeConfig(4));
    const pd = state.publicData as Record<string, unknown>;
    expect(pd['bids']).toBeDefined();
    expect(pd['tricksWon']).toBeDefined();
    expect(pd['scores']).toBeDefined();
    expect(pd['dealerId']).toBeDefined();
    expect(pd['trumpSuit']).toBeDefined();
    expect(pd['turnUpCard']).toBeDefined();
    expect(pd['forbiddenBids']).toBeDefined();
    expect(pd['maxBid']).toBe(1);
  });

  it('getValidActions offers legal bids for current bidder', () => {
    const state = engine.startGame(makeConfig(4));
    const current = state.currentTurn!;
    const actions = engine.getValidActions(state, current);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.type === 'bid')).toBe(true);
  });

  it('applyAction bid advances to next bidder', () => {
    let state = engine.startGame(makeConfig(4));
    const firstBidder = state.currentTurn!;
    state = engine.applyAction(state, firstBidder, {
      type: 'bid', payload: { amount: 0 },
    } as PlayerAction);
    expect(state.currentTurn).not.toBe(firstBidder);
    expect(state.version).toBeGreaterThan(1);
  });

  it('computeResult ranks by score (highest first)', () => {
    const state = engine.startGame(makeConfig(3));
    const ranks = engine.computeResult(state);
    expect(ranks).toHaveLength(3);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]!.rank).toBeGreaterThanOrEqual(ranks[i - 1]!.rank);
    }
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig(4)))).toBe(false);
  });

  it('6p and 7p still under 3-7 range', () => {
    for (const n of [6, 7]) {
      const state = engine.startGame(makeConfig(n));
      expect(state.players).toHaveLength(n);
    }
  });
});
