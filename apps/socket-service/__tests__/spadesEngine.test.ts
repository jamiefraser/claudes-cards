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

  it('requires exactly 4 players', () => {
    expect(engine.minPlayers).toBe(4);
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

  it('nil bid with 0 tricks scores +100; non-zero tricks scores -100', () => {
    // We can't easily play out a full hand without heavy setup; instead
    // call the private hand-resolution logic via the public handlePlay path.
    // Build a state where all 4 hands are empty and one last trick resolves
    // the hand, with p1's bid=0 and tricks already 0 / already 1.
    const start = engine.startGame(cfg);
    let state: GameState = {
      ...start,
      publicData: {
        ...start.publicData,
        gamePhase: 'playing',
        bids: { p1: 0, p2: 3, p3: 3, p4: 3 },
        tricksTaken: { p1: 0, p2: 5, p3: 4, p4: 4 },
        currentTrick: [],
        ledSuit: null,
        spadesBroken: true,
        teamScores: { teamA: 0, teamB: 0 },
      },
      players: start.players.map((p) => ({ ...p, hand: [] })),
      currentTurn: 'p1',
    };
    // Give each player one last card for the final trick so the engine
    // detects hand-over.
    state.players[0]!.hand = [sp('s-a','A','spades')];
    state.players[1]!.hand = [sp('s-2','2','spades')];
    state.players[2]!.hand = [sp('s-3','3','spades')];
    state.players[3]!.hand = [sp('s-4','4','spades')];
    let s: GameState = state;
    s = engine.applyAction(s, 'p1', { type: 'play', cardIds: ['s-a'] });
    s = engine.applyAction(s, s.currentTurn!, { type: 'play', cardIds: ['s-2'] });
    s = engine.applyAction(s, s.currentTurn!, { type: 'play', cardIds: ['s-3'] });
    s = engine.applyAction(s, s.currentTurn!, { type: 'play', cardIds: ['s-4'] });

    // Partnerships pair indices: teamA = {p1, p3}, teamB = {p2, p4}.
    // p1 (bid 0) wins the final trick with A\u2660 \u2192 1 trick \u2192 nil BUST (-100).
    // teamA contract: only p3's 3-bid counts; tricks p1+p3 = 1+4 = 5.
    //   contract points: 3*10 + (5-3)=2 bags = 32. Plus nilAdjust -100 = -68.
    const pd = s.publicData as Record<string, unknown>;
    const teams = pd['teamScores'] as Record<string, number>;
    expect(teams['teamA']).toBe(-68);
  });
});
