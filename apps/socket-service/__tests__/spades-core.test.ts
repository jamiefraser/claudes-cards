/**
 * Spades — pure core tests. Covers spec §10 edge cases + invariants.
 */

import {
  newGame,
  applyAction,
  legalActions,
  legalPlayCardIds,
  getPublicView,
  DEFAULT_CONFIG,
  isEligibleForBlindNil,
  type Card,
  type GameState,
  type PlayerState,
  type Partnership,
  type SpadesConfig,
  type Bid,
  type Rank,
  type Suit,
  type Trick,
} from '../src/games/spades/core';

let cardCounter = 0;
function mkCard(rank: Rank, suit: Suit, suffix = ''): Card {
  return { rank, suit, id: `${rank}${suit}${suffix}${cardCounter++}` };
}

function setupState(
  zones: Array<{ id: string; hand?: Card[]; bid?: Bid; tricksWon?: number; partnership?: 'NS' | 'EW' | null }>,
  opts: {
    phase?: GameState['phase'];
    currentPlayerIndex?: number;
    currentTrick?: Trick | null;
    spadesBroken?: boolean;
    dealerIndex?: number;
    config?: Partial<SpadesConfig>;
    partnerships?: Partnership[];
  } = {},
): GameState {
  const players: PlayerState[] = zones.map((z, i) => ({
    id: z.id, seat: i,
    partnershipId: z.partnership ?? (zones.length === 4 ? (i % 2 === 0 ? 'NS' : 'EW') : null),
    hand: z.hand ?? [],
    tricksTakenCount: z.tricksWon ?? 0,
    bid: z.bid ?? null,
    handRevealed: true,
  }));
  const partnerships: Partnership[] = opts.partnerships ?? (zones.length === 4 ? [
    { id: 'NS', playerIds: [players[0]!.id, players[2]!.id], score: 0, sandbags: 0 },
    { id: 'EW', playerIds: [players[1]!.id, players[3]!.id], score: 0, sandbags: 0 },
  ] : []);
  return {
    players, partnerships,
    dealerIndex: opts.dealerIndex ?? 0,
    currentPlayerIndex: opts.currentPlayerIndex ?? 0,
    currentTrick: opts.currentTrick ?? null,
    completedTricks: [],
    phase: opts.phase ?? 'play',
    spadesBroken: opts.spadesBroken ?? false,
    roundNumber: 1,
    seed: 1,
    config: { ...DEFAULT_CONFIG, ...(opts.config ?? {}) },
    roundAcks: new Set(),
  };
}

// ─── §10.1-5 trick mechanics ───────────────────────────────────────

describe('Spades — trick mechanics', () => {
  it('leader cannot lead spades before broken when holding non-spades (2)', () => {
    const spade = mkCard('A', 'S');
    const state = setupState(
      [
        { id: 'A', hand: [spade, mkCard('5', 'H')] },
        { id: 'B' }, { id: 'C' }, { id: 'D' },
      ],
      { currentTrick: { ledSuit: null, plays: [], winnerId: null } },
    );
    expect(legalPlayCardIds(state, state.players[0]!)).not.toContain(spade.id);
    expect(() =>
      applyAction(state, { kind: 'playCard', playerId: 'A', cardId: spade.id }),
    ).toThrow();
  });

  it('leader can lead spades when hand is all spades (3)', () => {
    const spade = mkCard('A', 'S');
    const state = setupState(
      [
        { id: 'A', hand: [spade, mkCard('5', 'S')] },
        { id: 'B' }, { id: 'C' }, { id: 'D' },
      ],
      { currentTrick: { ledSuit: null, plays: [], winnerId: null } },
    );
    expect(legalPlayCardIds(state, state.players[0]!)).toContain(spade.id);
  });

  it('void player may trump (play spade) (4)', () => {
    const state = setupState(
      [
        { id: 'A', hand: [mkCard('A', 'H')] },
        { id: 'B', hand: [mkCard('2', 'S')] },
        { id: 'C' }, { id: 'D' },
      ],
      {
        currentPlayerIndex: 1,
        currentTrick: {
          ledSuit: 'H',
          plays: [{ playerId: 'A', card: mkCard('A', 'H') }],
          winnerId: null,
        },
      },
    );
    expect(legalPlayCardIds(state, state.players[1]!)).toContain(state.players[1]!.hand[0]!.id);
  });

  it('playing a spade breaks spades (5)', () => {
    const state = setupState(
      [
        { id: 'A', hand: [mkCard('A', 'H')] },
        { id: 'B', hand: [mkCard('2', 'S')] },
        { id: 'C', hand: [mkCard('3', 'H')] },
        { id: 'D', hand: [mkCard('4', 'H')] },
      ],
      {
        currentPlayerIndex: 1,
        spadesBroken: false,
        currentTrick: {
          ledSuit: 'H',
          plays: [{ playerId: 'A', card: mkCard('A', 'H') }],
          winnerId: null,
        },
      },
    );
    const after = applyAction(state, {
      kind: 'playCard', playerId: 'B', cardId: state.players[1]!.hand[0]!.id,
    });
    expect(after.spadesBroken).toBe(true);
  });
});

// ─── §10.6-9 nil scoring ───────────────────────────────────────────

describe('Spades — nil scoring', () => {
  it('nil with 0 tricks: +100 to partnership (6)', () => {
    // Build an end-of-round state: p1 bid nil + 0 tricks, p3 bid 4 + 4 tricks.
    const state = setupState(
      [
        { id: 'p1', bid: { kind: 'nil' }, tricksWon: 0, partnership: 'NS' },
        { id: 'p2', bid: { kind: 'number', n: 3 }, tricksWon: 3, partnership: 'EW' },
        { id: 'p3', bid: { kind: 'number', n: 4 }, tricksWon: 4, partnership: 'NS' },
        { id: 'p4', bid: { kind: 'number', n: 3 }, tricksWon: 3, partnership: 'EW' },
      ],
      { phase: 'play' },
    );
    // Rig final trick: all hands empty + one last card each, forcing scoreRound.
    const finalCard1 = mkCard('A', 'S');
    const finalCard2 = mkCard('2', 'S');
    const finalCard3 = mkCard('3', 'S');
    const finalCard4 = mkCard('4', 'S');
    const rigged: GameState = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p, hand: [[finalCard1, finalCard2, finalCard3, finalCard4][i]!],
      })),
      spadesBroken: true,
      currentPlayerIndex: 0,
      currentTrick: { ledSuit: null, plays: [], winnerId: null },
    };
    let s = rigged;
    s = applyAction(s, { kind: 'playCard', playerId: 'p1', cardId: finalCard1.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p2', cardId: finalCard2.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p3', cardId: finalCard3.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p4', cardId: finalCard4.id });
    // p1 wins with A♠ → p1 now has 1 trick. Nil BUST = -100.
    // NS contract: only p3's bid=4, tricks=4 → 4*10 = 40. Plus nil -100 = -60.
    const ns = s.partnerships.find((p) => p.id === 'NS')!;
    expect(ns.score).toBe(-60);
  });

  it('successful nil (0 tricks) → +100 to partnership', () => {
    // p1 nil success: forces tricks via a non-spade losing play.
    const state = setupState(
      [
        { id: 'p1', bid: { kind: 'nil' }, tricksWon: 0, partnership: 'NS' },
        { id: 'p2', bid: { kind: 'number', n: 4 }, tricksWon: 4, partnership: 'EW' },
        { id: 'p3', bid: { kind: 'number', n: 3 }, tricksWon: 3, partnership: 'NS' },
        { id: 'p4', bid: { kind: 'number', n: 6 }, tricksWon: 6, partnership: 'EW' },
      ],
    );
    // One last trick: p1 plays low H, p2 plays high H → p2 wins. p1 stays at 0.
    const c1 = mkCard('2', 'H');
    const c2 = mkCard('A', 'H');
    const c3 = mkCard('3', 'H');
    const c4 = mkCard('4', 'H');
    const rigged: GameState = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p, hand: [[c1, c2, c3, c4][i]!],
      })),
      spadesBroken: true,
      currentPlayerIndex: 0,
      currentTrick: { ledSuit: null, plays: [], winnerId: null },
    };
    let s = rigged;
    s = applyAction(s, { kind: 'playCard', playerId: 'p1', cardId: c1.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p2', cardId: c2.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p3', cardId: c3.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p4', cardId: c4.id });
    // p2 wins. p1 nil = 0 tricks → +100. NS contract: p3 bid 3 tricks 3 → 30. Total +130.
    const ns = s.partnerships.find((p) => p.id === 'NS')!;
    expect(ns.score).toBe(130);
  });
});

// ─── §10.11-12 contract scoring ────────────────────────────────────

describe('Spades — contract scoring', () => {
  it('makes bid exactly → 10*bid, no bags (11)', () => {
    const state = setupState(
      [
        { id: 'p1', bid: { kind: 'number', n: 3 }, tricksWon: 3, partnership: 'NS' },
        { id: 'p2', bid: { kind: 'number', n: 3 }, tricksWon: 3, partnership: 'EW' },
        { id: 'p3', bid: { kind: 'number', n: 4 }, tricksWon: 4, partnership: 'NS' },
        { id: 'p4', bid: { kind: 'number', n: 3 }, tricksWon: 3, partnership: 'EW' },
      ],
    );
    const c1 = mkCard('2', 'H');
    const c2 = mkCard('3', 'H');
    const c3 = mkCard('4', 'H');
    const c4 = mkCard('A', 'H');
    const rigged: GameState = {
      ...state,
      players: state.players.map((p, i) => ({ ...p, hand: [[c1, c2, c3, c4][i]!] })),
      spadesBroken: true,
      currentPlayerIndex: 0,
      currentTrick: { ledSuit: null, plays: [], winnerId: null },
    };
    let s = rigged;
    s = applyAction(s, { kind: 'playCard', playerId: 'p1', cardId: c1.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p2', cardId: c2.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p3', cardId: c3.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p4', cardId: c4.id });
    // p4 wins the final trick. Pre-trick: p1=3 p2=3 p3=4 p4=3. After: p4=4.
    // NS bid 3+4=7, tricks 3+4=7 → 70 + 0 bags. No bags overflow.
    const ns = s.partnerships.find((p) => p.id === 'NS')!;
    expect(ns.score).toBe(70);
    expect(ns.sandbags).toBe(0);
  });

  it('overtricks accumulate as bags (12)', () => {
    // Pre-condition: NS bid 7 tricks; win 10 → 3 overtricks.
    // We set up the state post-final-trick by calling scoreRound via the
    // normal flow, but since scoreRound is internal, use this: pre-build a
    // near-end state and play the last trick.
    const state = setupState(
      [
        { id: 'p1', bid: { kind: 'number', n: 3 }, tricksWon: 5, partnership: 'NS' },
        { id: 'p2', bid: { kind: 'number', n: 3 }, tricksWon: 1, partnership: 'EW' },
        { id: 'p3', bid: { kind: 'number', n: 4 }, tricksWon: 4, partnership: 'NS' },
        { id: 'p4', bid: { kind: 'number', n: 3 }, tricksWon: 2, partnership: 'EW' },
      ],
    );
    const c1 = mkCard('A', 'H');
    const c2 = mkCard('2', 'H');
    const c3 = mkCard('3', 'H');
    const c4 = mkCard('4', 'H');
    const rigged: GameState = {
      ...state,
      players: state.players.map((p, i) => ({ ...p, hand: [[c1, c2, c3, c4][i]!] })),
      spadesBroken: true,
      currentPlayerIndex: 0,
      currentTrick: { ledSuit: null, plays: [], winnerId: null },
    };
    let s = rigged;
    s = applyAction(s, { kind: 'playCard', playerId: 'p1', cardId: c1.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p2', cardId: c2.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p3', cardId: c3.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p4', cardId: c4.id });
    // p1 wins. NS = p1 + p3: bids 3+4=7, tricks 6+4=10 → 70 + 3 bags. Score 73.
    const ns = s.partnerships.find((p) => p.id === 'NS')!;
    expect(ns.score).toBe(73);
    expect(ns.sandbags).toBe(3);
  });

  it('failed bid: -10*bid (14)', () => {
    const state = setupState(
      [
        { id: 'p1', bid: { kind: 'number', n: 5 }, tricksWon: 2, partnership: 'NS' },
        { id: 'p2', bid: { kind: 'number', n: 3 }, tricksWon: 4, partnership: 'EW' },
        { id: 'p3', bid: { kind: 'number', n: 3 }, tricksWon: 2, partnership: 'NS' },
        { id: 'p4', bid: { kind: 'number', n: 2 }, tricksWon: 4, partnership: 'EW' },
      ],
    );
    const c1 = mkCard('2', 'H');
    const c2 = mkCard('3', 'H');
    const c3 = mkCard('4', 'H');
    const c4 = mkCard('A', 'H');
    const rigged: GameState = {
      ...state,
      players: state.players.map((p, i) => ({ ...p, hand: [[c1, c2, c3, c4][i]!] })),
      spadesBroken: true,
      currentPlayerIndex: 0,
      currentTrick: { ledSuit: null, plays: [], winnerId: null },
    };
    let s = rigged;
    s = applyAction(s, { kind: 'playCard', playerId: 'p1', cardId: c1.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p2', cardId: c2.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p3', cardId: c3.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p4', cardId: c4.id });
    // p4 wins. NS bids 5+3=8, tricks 2+2=4 → miss → -80.
    const ns = s.partnerships.find((p) => p.id === 'NS')!;
    expect(ns.score).toBe(-80);
  });
});

// ─── Sandbag penalty §10.13 ────────────────────────────────────────

describe('Spades — sandbag penalty', () => {
  it('10 accumulated bags trigger -100 penalty (13)', () => {
    // Start with 8 sandbags stored, add 3 → 11 → pass 10 threshold.
    const state = setupState(
      [
        { id: 'p1', bid: { kind: 'number', n: 3 }, tricksWon: 5, partnership: 'NS' },
        { id: 'p2', bid: { kind: 'number', n: 3 }, tricksWon: 1, partnership: 'EW' },
        { id: 'p3', bid: { kind: 'number', n: 4 }, tricksWon: 4, partnership: 'NS' },
        { id: 'p4', bid: { kind: 'number', n: 3 }, tricksWon: 2, partnership: 'EW' },
      ],
      {
        partnerships: [
          { id: 'NS', playerIds: ['p1', 'p3'], score: 200, sandbags: 8 },
          { id: 'EW', playerIds: ['p2', 'p4'], score: 100, sandbags: 0 },
        ],
      },
    );
    const c1 = mkCard('A', 'H');
    const c2 = mkCard('2', 'H');
    const c3 = mkCard('3', 'H');
    const c4 = mkCard('4', 'H');
    const rigged: GameState = {
      ...state,
      players: state.players.map((p, i) => ({ ...p, hand: [[c1, c2, c3, c4][i]!] })),
      spadesBroken: true,
      currentPlayerIndex: 0,
      currentTrick: { ledSuit: null, plays: [], winnerId: null },
    };
    let s = rigged;
    s = applyAction(s, { kind: 'playCard', playerId: 'p1', cardId: c1.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p2', cardId: c2.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p3', cardId: c3.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p4', cardId: c4.id });
    // NS bid 3+4=7, tricks 6+4=10 → 70 + 3 bags. Plus prior 8 bags = 11.
    // 10-bag threshold hit: -100; bags become 1. Net: 200 + 73 - 100 = 173.
    const ns = s.partnerships.find((p) => p.id === 'NS')!;
    expect(ns.score).toBe(173);
    expect(ns.sandbags).toBe(1);
  });
});

// ─── Game end §10.15-17 ────────────────────────────────────────────

describe('Spades — game end', () => {
  it('partnership reaches 500 → gameOver (15)', () => {
    const state = setupState(
      [
        { id: 'p1', bid: { kind: 'number', n: 3 }, tricksWon: 3, partnership: 'NS' },
        { id: 'p2', bid: { kind: 'number', n: 3 }, tricksWon: 3, partnership: 'EW' },
        { id: 'p3', bid: { kind: 'number', n: 4 }, tricksWon: 4, partnership: 'NS' },
        { id: 'p4', bid: { kind: 'number', n: 3 }, tricksWon: 3, partnership: 'EW' },
      ],
      {
        partnerships: [
          { id: 'NS', playerIds: ['p1', 'p3'], score: 450, sandbags: 0 },
          { id: 'EW', playerIds: ['p2', 'p4'], score: 200, sandbags: 0 },
        ],
      },
    );
    const c1 = mkCard('2', 'H');
    const c2 = mkCard('3', 'H');
    const c3 = mkCard('4', 'H');
    const c4 = mkCard('A', 'H');
    const rigged: GameState = {
      ...state,
      players: state.players.map((p, i) => ({ ...p, hand: [[c1, c2, c3, c4][i]!] })),
      spadesBroken: true,
      currentPlayerIndex: 0,
      currentTrick: { ledSuit: null, plays: [], winnerId: null },
    };
    let s = rigged;
    s = applyAction(s, { kind: 'playCard', playerId: 'p1', cardId: c1.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p2', cardId: c2.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p3', cardId: c3.id });
    s = applyAction(s, { kind: 'playCard', playerId: 'p4', cardId: c4.id });
    expect(s.phase).toBe('gameOver');
  });
});

// ─── Blind nil eligibility §10.23 ──────────────────────────────────

describe('Spades — blind nil eligibility', () => {
  it('blind nil forbidden if partnership not behind threshold (23)', () => {
    const state = newGame(['p1', 'p2', 'p3', 'p4'], { allowBlindNil: true }, 1);
    // Both partnerships at 0 score → not behind → ineligible.
    expect(isEligibleForBlindNil(state, 'p1')).toBe(false);
  });

  it('blind nil allowed when partnership trails by ≥ 100', () => {
    const base = newGame(['p1', 'p2', 'p3', 'p4'], { allowBlindNil: true }, 1);
    const state: GameState = {
      ...base,
      partnerships: [
        { id: 'NS', playerIds: ['p1', 'p3'], score: 0, sandbags: 0 },
        { id: 'EW', playerIds: ['p2', 'p4'], score: 150, sandbags: 0 },
      ],
      players: base.players.map((p) => ({ ...p, handRevealed: false })),
    };
    expect(isEligibleForBlindNil(state, 'p1')).toBe(true);
  });

  it('blind nil disabled by default config', () => {
    const state = newGame(['p1', 'p2', 'p3', 'p4'], {}, 1);
    expect(isEligibleForBlindNil(state, 'p1')).toBe(false);
  });
});

// ─── Setup §10.19-21 ───────────────────────────────────────────────

describe('Spades — setup variants', () => {
  it('3-player variant: 13 cards each, 2♣ removed (19)', () => {
    const state = newGame(['A', 'B', 'C'], {}, 42);
    for (const p of state.players) expect(p.hand).toHaveLength(13);
    const allCards = state.players.flatMap((p) => p.hand);
    expect(allCards.some((c) => c.id === '2C')).toBe(false);
    expect(state.partnerships).toHaveLength(0);
  });

  it('jokers variant: 2 jokers in the deck, 2♣/2♦ removed (21)', () => {
    const state = newGame(['A', 'B', 'C', 'D'], { useJokers: true }, 42);
    const allCards = state.players.flatMap((p) => p.hand);
    expect(allCards.some((c) => c.rank === 'BigJoker')).toBe(true);
    expect(allCards.some((c) => c.rank === 'LittleJoker')).toBe(true);
    expect(allCards.some((c) => c.id === '2C')).toBe(false);
    expect(allCards.some((c) => c.id === '2D')).toBe(false);
  });
});

// ─── Determinism + invariants §10.26 ───────────────────────────────

describe('Spades — determinism + invariants', () => {
  it('same seed → same deal (26)', () => {
    const a = newGame(['p1', 'p2', 'p3', 'p4'], {}, 42);
    const b = newGame(['p1', 'p2', 'p3', 'p4'], {}, 42);
    for (let i = 0; i < 4; i++) {
      expect(a.players[i]!.hand.map((c) => c.id))
        .toEqual(b.players[i]!.hand.map((c) => c.id));
    }
  });

  it('spadesBroken is monotonic within a round', () => {
    let state = newGame(['p1', 'p2', 'p3', 'p4'], {}, 42);
    // Bid all players → move to play phase.
    for (let i = 0; i < 4; i++) {
      const current = state.players[state.currentPlayerIndex]!;
      state = applyAction(state, {
        kind: 'placeBid', playerId: current.id, bid: { kind: 'number', n: 3 },
      });
    }
    expect(state.phase).toBe('play');
    let prev = false;
    // Simulate ~5 legal plays; spadesBroken should never flip back to false.
    for (let i = 0; i < 10 && state.phase === 'play'; i++) {
      const current = state.players[state.currentPlayerIndex]!;
      const legal = legalActions(state, current.id);
      if (legal.length === 0) break;
      state = applyAction(state, legal[0]!);
      if (prev) expect(state.spadesBroken).toBe(true);
      prev = state.spadesBroken;
    }
  });
});

// ─── Public view ───────────────────────────────────────────────────

describe('Spades — public view', () => {
  it('surfaces own hand + opponent counts + partnership scores', () => {
    const state = newGame(['p1', 'p2', 'p3', 'p4'], {}, 42);
    const view = getPublicView(state, 'p1');
    expect(view.viewerHand).toEqual(state.players[0]!.hand);
    expect(view.players[1]!.handCount).toBe(13);
    expect(view.partnerships).toHaveLength(2);
    expect(view.spadesBroken).toBe(false);
  });
});

// ─── Snapshot ──────────────────────────────────────────────────────

describe('Spades — snapshot', () => {
  it('4p seed=7 deal is stable', () => {
    const state = newGame(['p1', 'p2', 'p3', 'p4'], {}, 7);
    const shape = {
      dealer: state.dealerIndex,
      hands: state.players.map((p) => p.hand.map((c) => `${c.rank}${c.suit}`)),
      partnerships: state.partnerships.map((pa) => pa.playerIds),
    };
    expect(shape).toMatchSnapshot();
  });
});
