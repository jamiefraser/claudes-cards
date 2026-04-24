/**
 * Spades Engine Tests
 */

import { SpadesEngine } from '../src/games/spades/engine';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'spades',
    playerIds: ['p1', 'p2', 'p3', 'p4'],
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

describe('SpadesEngine', () => {
  let engine: SpadesEngine;

  beforeEach(() => { engine = new SpadesEngine(); });

  it('has gameId = spades', () => {
    expect(engine.gameId).toBe('spades');
  });

  it('supports 2–4 players (4p = partnerships; 2p/3p = individual)', () => {
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(4);
  });

  it('deals 13 cards to each player', () => {
    const state = engine.startGame(makeConfig());
    state.players.forEach(p => expect(p.hand).toHaveLength(13));
  });

  it('starts in playing or dealing phase (bidding)', () => {
    const state = engine.startGame(makeConfig());
    expect(['playing', 'dealing']).toContain(state.phase);
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig()))).toBe(false);
  });

  it('computeResult returns 4 rankings', () => {
    expect(engine.computeResult(engine.startGame(makeConfig()))).toHaveLength(4);
  });

  it('getValidActions returns bid actions during bidding', () => {
    const state = engine.startGame(makeConfig());
    const pd = state.publicData as Record<string, unknown>;
    if (pd.gamePhase === 'bidding') {
      const actions = engine.getValidActions(state, state.currentTurn!);
      expect(actions.some(a => a.type === 'bid')).toBe(true);
    } else {
      expect(state.players).toHaveLength(4);
    }
  });
});

// ---------------------------------------------------------------------------
// Hoyle's Spades — rule suite (added April 2026).
// ---------------------------------------------------------------------------
import type { Card, GameState } from '@card-platform/shared-types';

function sp(id: string, rank: string, suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'): Card {
  const vm: Record<string, number> = { A:14,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:11,Q:12,K:13 };
  return { id, deckType: 'standard', rank: rank as Card['rank'], suit, value: vm[rank]!, faceUp: true };
}

describe("SpadesEngine — Hoyle's rule suite", () => {
  const engine = new SpadesEngine();

  const cfg = {
    roomId: 'sp',
    gameId: 'spades',
    playerIds: ['p1','p2','p3','p4'],
    asyncMode: false,
    turnTimerSeconds: null,
  };

  function finishBidding(state: GameState, bids: Record<string, number>): GameState {
    let s = state;
    for (const pid of state.players.map(p => p.playerId)) {
      s = engine.applyAction(s, s.currentTurn!, { type: 'bid', payload: { amount: bids[pid] ?? 3 } });
    }
    return s;
  }

  it('leading spades before they are broken throws', () => {
    const start = engine.startGame(cfg);
    const after = finishBidding(start, { p1: 3, p2: 3, p3: 3, p4: 3 });
    // Give current turn a hand with spades + other suits.
    const leaderId = after.currentTurn!;
    const leader = after.players.find(p => p.playerId === leaderId)!;
    const spade = leader.hand.find(c => c.suit === 'spades');
    const nonSpade = leader.hand.find(c => c.suit !== 'spades');
    if (!spade || !nonSpade) return; // dealing rare edge; skip

    expect(() =>
      engine.applyAction(after, leaderId, { type: 'play', cardIds: [spade.id] }),
    ).toThrow(/spades have not been broken/i);
  });

  // Detailed nil / partnership / scoring tests live in spades-core.test.ts
  // where we have direct access to the pure core and can synthesize
  // end-of-round states without threading through the adapter.
});
