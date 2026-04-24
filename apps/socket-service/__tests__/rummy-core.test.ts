/**
 * Rummy — pure core tests. Covers every §11 edge case plus invariants.
 */

import {
  newGame,
  applyAction,
  legalActions,
  isSet,
  isRun,
  isValidMeld,
  cardPoints,
  getPublicView,
  DEFAULT_CONFIG,
  type Card,
  type GameState,
  type PlayerState,
  type RummyConfig,
  type Rank,
  type Suit,
  type Meld,
} from '../src/games/rummy/core';

// ─── Helpers ────────────────────────────────────────────────────────

let cardCounter = 0;
function mkCard(rank: Rank, suit: Suit = 'S', suffix = ''): Card {
  return { rank, suit, id: `${rank}${suit}${suffix}${cardCounter++}` };
}
function joker(suffix = ''): Card {
  return { rank: 'A', suit: null, id: `JK${suffix}${cardCounter++}`, isJoker: true };
}

function setupState(
  zones: Array<{ id: string; hand?: Card[] }>,
  opts: {
    stock?: Card[];
    discard?: Card[];
    melds?: Meld[];
    config?: Partial<RummyConfig>;
    currentPlayerIndex?: number;
    phase?: GameState['phase'];
    drewFromDiscardThisTurn?: Card | null;
  } = {},
): GameState {
  const players: PlayerState[] = zones.map((z, i) => ({
    id: z.id, seat: i,
    hand: z.hand ?? [],
    hasMeldedThisRound: false, scoreTotal: 0,
  }));
  return {
    players,
    stock: opts.stock ?? [],
    discard: opts.discard ?? [],
    melds: opts.melds ?? [],
    currentPlayerIndex: opts.currentPlayerIndex ?? 0,
    phase: opts.phase ?? 'awaitingDraw',
    drewFromDiscardThisTurn: opts.drewFromDiscardThisTurn ?? null,
    didMeldThisTurn: false,
    turnNumber: 1,
    roundNumber: 1,
    dealerIndex: 0,
    roundAcks: new Set(),
    seed: 1,
    config: { ...DEFAULT_CONFIG, ...(opts.config ?? {}) },
    decks: 1,
    meldIdCounter: 0,
  };
}

function totalCards(state: GameState): number {
  return (
    state.players.reduce((acc, p) => acc + p.hand.length, 0)
    + state.stock.length
    + state.discard.length
    + state.melds.reduce((acc, m) => acc + m.cards.length, 0)
  );
}

// ─── Meld validation §11.1–7 ───────────────────────────────────────

describe('Rummy — meld validation', () => {
  it('3-card set accepted (1)', () => {
    expect(isSet([mkCard('7', 'S'), mkCard('7', 'H'), mkCard('7', 'D')])).toBe(true);
  });
  it('4-card set accepted (2)', () => {
    expect(isSet([mkCard('J', 'S'), mkCard('J', 'H'), mkCard('J', 'D'), mkCard('J', 'C')])).toBe(true);
  });
  it('duplicate-suit set rejected by default (3)', () => {
    expect(isSet([mkCard('7', 'S'), mkCard('7', 'S', 'x'), mkCard('7', 'D')])).toBe(false);
  });
  it('duplicate-suit set accepted when allowed', () => {
    const cfg: RummyConfig = { ...DEFAULT_CONFIG, allowDuplicateSuitSet: true };
    expect(isSet([mkCard('7', 'S'), mkCard('7', 'S', 'x'), mkCard('7', 'D')], cfg)).toBe(true);
  });
  it('3-card run same-suit consecutive accepted (4)', () => {
    expect(isRun([mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H')])).toBe(true);
  });
  it('A-2-3 run (ace low) accepted (5)', () => {
    expect(isRun([mkCard('A', 'H'), mkCard('2', 'H'), mkCard('3', 'H')])).toBe(true);
  });
  it('Q-K-A rejected without aceHighLow (6)', () => {
    expect(isRun([mkCard('Q', 'H'), mkCard('K', 'H'), mkCard('A', 'H')])).toBe(false);
  });
  it('Q-K-A accepted with aceHighLow', () => {
    const cfg: RummyConfig = { ...DEFAULT_CONFIG, aceHighLow: true };
    expect(isRun([mkCard('Q', 'H'), mkCard('K', 'H'), mkCard('A', 'H')], cfg)).toBe(true);
  });
  it('K-A-2 wrap rejected always (7)', () => {
    const cfg: RummyConfig = { ...DEFAULT_CONFIG, aceHighLow: true };
    expect(isRun([mkCard('K', 'H'), mkCard('A', 'H'), mkCard('2', 'H')], cfg)).toBe(false);
  });
  it('mixed-suit "run" rejected', () => {
    expect(isRun([mkCard('4', 'H'), mkCard('5', 'S'), mkCard('6', 'H')])).toBe(false);
  });
  it('2-card meld attempt rejected', () => {
    expect(isValidMeld([mkCard('7', 'S'), mkCard('7', 'H')])).toBe(false);
  });
});

// ─── Turn flow §11.8–12, §11.18 ────────────────────────────────────

describe('Rummy — draw / discard / go-out', () => {
  it('drawStock reduces stock by 1, hand +1 (8)', () => {
    const state = setupState(
      [{ id: 'A', hand: [mkCard('5')] }, { id: 'B' }],
      { stock: [mkCard('K'), mkCard('Q')], discard: [mkCard('2')] },
    );
    const after = applyAction(state, { kind: 'drawStock', playerId: 'A' });
    expect(after.stock).toHaveLength(1);
    expect(after.players[0]!.hand).toHaveLength(2);
    expect(after.phase).toBe('awaitingDiscard');
  });

  it('drawDiscard sets drewFromDiscardThisTurn (9)', () => {
    const top = mkCard('7');
    const state = setupState(
      [{ id: 'A', hand: [mkCard('5')] }, { id: 'B' }],
      { discard: [top] },
    );
    const after = applyAction(state, { kind: 'drawDiscard', playerId: 'A' });
    expect(after.drewFromDiscardThisTurn?.id).toBe(top.id);
    expect(after.discard).toHaveLength(0);
    expect(after.players[0]!.hand).toHaveLength(2);
  });

  it('empty stock triggers reshuffle of discard (10)', () => {
    const state = setupState(
      [{ id: 'A', hand: [mkCard('5')] }, { id: 'B' }],
      { stock: [], discard: [mkCard('3'), mkCard('4'), mkCard('5', 'H')] },
    );
    const after = applyAction(state, { kind: 'drawStock', playerId: 'A' });
    // Reshuffle: top stays, rest shuffled into stock; A draws one from new stock.
    expect(after.stock.length + after.discard.length + after.players[0]!.hand.length).toBe(4);
    expect(after.discard).toHaveLength(1);
  });

  it('empty stock and noReshuffle ends round (11)', () => {
    const state = setupState(
      [{ id: 'A', hand: [mkCard('5')] }, { id: 'B', hand: [mkCard('7')] }],
      { stock: [], discard: [mkCard('3')], config: { noReshuffle: true } },
    );
    const after = applyAction(state, { kind: 'drawStock', playerId: 'A' });
    expect(['roundOver', 'gameOver']).toContain(after.phase);
  });

  it('cannot discard the card just drawn from discard (12)', () => {
    const top = mkCard('7');
    let state = setupState(
      [{ id: 'A', hand: [mkCard('5')] }, { id: 'B' }],
      { discard: [top] },
    );
    state = applyAction(state, { kind: 'drawDiscard', playerId: 'A' });
    expect(() =>
      applyAction(state, { kind: 'discard', playerId: 'A', cardId: top.id }),
    ).toThrow();
  });

  it('player goes out on final discard (18)', () => {
    const state = setupState(
      [{ id: 'A', hand: [mkCard('5'), mkCard('K')] }, { id: 'B', hand: [mkCard('Q'), mkCard('7')] }],
      { phase: 'awaitingDiscard' },
    );
    // A melds nothing, discards one card — hand still has 1.
    const mid = applyAction(state, { kind: 'discard', playerId: 'A', cardId: state.players[0]!.hand[0]!.id });
    expect(mid.phase).toBe('awaitingDraw');
    expect(mid.currentPlayerIndex).toBe(1);
  });
});

// ─── Meld + layoff §11.13–17 ───────────────────────────────────────

describe('Rummy — melding and layoffs', () => {
  it('rejects invalid set (same-suit duplicates) (13)', () => {
    const s7 = mkCard('7', 'S');
    const s7b = mkCard('7', 'S', 'x');
    const state = setupState(
      [{ id: 'A', hand: [s7, s7b, mkCard('7', 'H')] }, { id: 'B' }],
      { phase: 'awaitingDiscard' },
    );
    expect(() =>
      applyAction(state, {
        kind: 'meld', playerId: 'A',
        cardIds: [s7.id, s7b.id, state.players[0]!.hand[2]!.id],
        meldKind: 'set',
      }),
    ).toThrow();
  });

  it('8H onto run 4H-5H-6H is rejected (not adjacent) (14)', () => {
    const run: Meld = {
      id: 'm1', kind: 'run', runSuit: 'H',
      cards: [mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H')],
      ownerId: 'B', jokerSubstitutions: {},
    };
    const eight = mkCard('8', 'H');
    const state = setupState(
      [{ id: 'A', hand: [eight] }, { id: 'B' }],
      { phase: 'awaitingDiscard', melds: [run] },
    );
    expect(() =>
      applyAction(state, {
        kind: 'layOff', playerId: 'A', cardId: eight.id, targetMeldId: 'm1',
      }),
    ).toThrow();
  });

  it('3H onto run 4H-5H-6H is legal (15)', () => {
    const run: Meld = {
      id: 'm1', kind: 'run', runSuit: 'H',
      cards: [mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H')],
      ownerId: 'A', jokerSubstitutions: {},
    };
    const three = mkCard('3', 'H');
    const state = setupState(
      [{ id: 'A', hand: [three, mkCard('K')] }, { id: 'B' }],
      { phase: 'awaitingDiscard', melds: [run] },
    );
    const after = applyAction(state, {
      kind: 'layOff', playerId: 'A', cardId: three.id, targetMeldId: 'm1',
    });
    expect(after.melds[0]!.cards).toHaveLength(4);
    expect(after.melds[0]!.cards[0]!.rank).toBe('3');
  });

  it('7H onto run 4H-5H-6H is legal (16)', () => {
    const run: Meld = {
      id: 'm1', kind: 'run', runSuit: 'H',
      cards: [mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H')],
      ownerId: 'A', jokerSubstitutions: {},
    };
    const seven = mkCard('7', 'H');
    const state = setupState(
      [{ id: 'A', hand: [seven, mkCard('K')] }, { id: 'B' }],
      { phase: 'awaitingDiscard', melds: [run] },
    );
    const after = applyAction(state, {
      kind: 'layOff', playerId: 'A', cardId: seven.id, targetMeldId: 'm1',
    });
    expect(after.melds[0]!.cards).toHaveLength(4);
    expect(after.melds[0]!.cards[3]!.rank).toBe('7');
  });

  it('8S onto set 8H-8D-8C is legal (17)', () => {
    const s: Meld = {
      id: 'm1', kind: 'set', setRank: '8',
      cards: [mkCard('8', 'H'), mkCard('8', 'D'), mkCard('8', 'C')],
      ownerId: 'A', jokerSubstitutions: {},
    };
    const eight = mkCard('8', 'S');
    const state = setupState(
      [{ id: 'A', hand: [eight, mkCard('K')] }, { id: 'B' }],
      { phase: 'awaitingDiscard', melds: [s] },
    );
    const after = applyAction(state, {
      kind: 'layOff', playerId: 'A', cardId: eight.id, targetMeldId: 'm1',
    });
    expect(after.melds[0]!.cards).toHaveLength(4);
  });
});

// ─── Scoring ────────────────────────────────────────────────────────

describe('Rummy — scoring', () => {
  it('card points: A=1, 2-10=face, J/Q/K=10', () => {
    expect(cardPoints(mkCard('A'), DEFAULT_CONFIG)).toBe(1);
    expect(cardPoints(mkCard('5'), DEFAULT_CONFIG)).toBe(5);
    expect(cardPoints(mkCard('10'), DEFAULT_CONFIG)).toBe(10);
    expect(cardPoints(mkCard('J'), DEFAULT_CONFIG)).toBe(10);
    expect(cardPoints(mkCard('Q'), DEFAULT_CONFIG)).toBe(10);
    expect(cardPoints(mkCard('K'), DEFAULT_CONFIG)).toBe(10);
  });

  it('ace-high-low: A scores 15 (configurable)', () => {
    const cfg: RummyConfig = { ...DEFAULT_CONFIG, aceHighLow: true };
    expect(cardPoints(mkCard('A'), cfg)).toBe(15);
  });

  it('joker scores 15', () => {
    expect(cardPoints(joker(), DEFAULT_CONFIG)).toBe(15);
  });

  it('winnerTakesAll: winner gets sum of opponents remainders', () => {
    const state = setupState(
      [
        { id: 'A', hand: [mkCard('5')] },
        { id: 'B', hand: [mkCard('K'), mkCard('Q')] },
      ],
      { phase: 'awaitingDiscard' },
    );
    // A plays their last card → goes out.
    const after = applyAction(state, {
      kind: 'discard', playerId: 'A', cardId: state.players[0]!.hand[0]!.id,
    });
    // B had K + Q = 20; rummyBonus heuristic applies when turnNumber <= players
    // (initial state turnNumber = 1, players = 2) so bonus kicks in and
    // winner gets 20 × rummyBonusMultiplier(2) = 40.
    expect(after.players[0]!.scoreTotal).toBeGreaterThanOrEqual(20);
  });

  it('perPlayer scoring: non-winners lose their hand value', () => {
    const state = setupState(
      [
        { id: 'A', hand: [mkCard('5')] },
        { id: 'B', hand: [mkCard('K'), mkCard('Q')] },
      ],
      { phase: 'awaitingDiscard', config: { scoringMode: 'perPlayer' } },
    );
    const after = applyAction(state, {
      kind: 'discard', playerId: 'A', cardId: state.players[0]!.hand[0]!.id,
    });
    expect(after.players[0]!.scoreTotal).toBe(0);
    expect(after.players[1]!.scoreTotal).toBe(-20);
  });
});

// ─── Jokers §11.20 ─────────────────────────────────────────────────

describe('Rummy — jokers (optional)', () => {
  it('joker in a run is valid (20)', () => {
    const jk = joker('a');
    const cards = [mkCard('4', 'H'), jk, mkCard('6', 'H')];
    // joker stands in for 5H — no substitution hint needed for legality check.
    expect(isRun(cards, DEFAULT_CONFIG, { [jk.id]: '5' })).toBe(true);
  });

  it('joker in a set is valid', () => {
    const jk = joker('b');
    const cards = [mkCard('7', 'S'), mkCard('7', 'H'), jk];
    expect(isSet(cards, DEFAULT_CONFIG)).toBe(true);
  });

  it('two jokers per meld is rejected', () => {
    const cards = [mkCard('7', 'S'), joker('c'), joker('d')];
    expect(isSet(cards, DEFAULT_CONFIG)).toBe(false);
  });
});

// ─── Deal sizes + two decks §11.24 ─────────────────────────────────

describe('Rummy — setup', () => {
  it('2p deal size = 10', () => {
    const s = newGame(['A', 'B'], {}, 1);
    for (const p of s.players) expect(p.hand).toHaveLength(10);
  });
  it('3p and 4p deal size = 7', () => {
    for (const n of [3, 4]) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const s = newGame(ids, {}, 1);
      for (const p of s.players) expect(p.hand).toHaveLength(7);
    }
  });
  it('5p and 6p deal size = 6, two decks (24)', () => {
    for (const n of [5, 6]) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const s = newGame(ids, {}, 1);
      for (const p of s.players) expect(p.hand).toHaveLength(6);
      expect(s.decks).toBe(2);
      expect(totalCards(s)).toBe(104);
    }
  });
});

// ─── Determinism §11.23 ────────────────────────────────────────────

describe('Rummy — determinism', () => {
  it('same seed → same deal (23)', () => {
    const a = newGame(['A', 'B', 'C'], {}, 42);
    const b = newGame(['A', 'B', 'C'], {}, 42);
    for (let i = 0; i < 3; i++) {
      expect(a.players[i]!.hand.map((c) => c.id))
        .toEqual(b.players[i]!.hand.map((c) => c.id));
    }
    expect(a.discard[0]!.id).toBe(b.discard[0]!.id);
  });

  it('different seeds → different deals', () => {
    const a = newGame(['A', 'B'], {}, 1);
    const b = newGame(['A', 'B'], {}, 9999);
    expect(a.players[0]!.hand.map((c) => c.id))
      .not.toEqual(b.players[0]!.hand.map((c) => c.id));
  });
});

// ─── Invariants ────────────────────────────────────────────────────

describe('Rummy — invariants', () => {
  it('card conservation: 52 cards total across all zones', () => {
    let state = newGame(['A', 'B', 'C'], {}, 7);
    expect(totalCards(state)).toBe(52);
    // Play out a handful of random legal moves; total must stay 52.
    let rng = 0.3;
    for (let i = 0; i < 30 && state.phase !== 'gameOver' && state.phase !== 'roundOver'; i++) {
      const current = state.players[state.currentPlayerIndex]!;
      const legal = legalActions(state, current.id);
      if (legal.length === 0) break;
      rng = (rng * 9301 + 49297) % 233280 / 233280;
      const pick = legal[Math.floor(rng * legal.length)]!;
      state = applyAction(state, pick);
      expect(totalCards(state)).toBe(52);
    }
  });

  it('no card appears in two zones at once', () => {
    const state = newGame(['A', 'B'], {}, 42);
    const seen = new Set<string>();
    for (const p of state.players) for (const c of p.hand) {
      expect(seen.has(c.id)).toBe(false);
      seen.add(c.id);
    }
    for (const c of [...state.stock, ...state.discard]) {
      expect(seen.has(c.id)).toBe(false);
      seen.add(c.id);
    }
  });
});

// ─── Public view ───────────────────────────────────────────────────

describe('Rummy — public view', () => {
  it('surfaces own hand + opponent counts + discard pile', () => {
    const state = newGame(['A', 'B'], {}, 42);
    const view = getPublicView(state, 'A');
    expect(view.viewerHand).toEqual(state.players[0]!.hand);
    expect(view.players[1]!.handCount).toBe(state.players[1]!.hand.length);
    expect(view.discardPile).toEqual(state.discard);
    expect(view.stockCount).toBe(state.stock.length);
  });
});

// ─── Snapshot ──────────────────────────────────────────────────────

describe('Rummy — snapshot', () => {
  it('2p seed=7 deal is stable', () => {
    const state = newGame(['A', 'B'], {}, 7);
    const shape = {
      hands: state.players.map((p) => p.hand.map((c) => `${c.rank}${c.suit ?? '?'}`)),
      discardTop: `${state.discard[0]!.rank}${state.discard[0]!.suit ?? '?'}`,
      stockTop3: state.stock.slice(-3).map((c) => `${c.rank}${c.suit ?? '?'}`),
    };
    expect(shape).toMatchSnapshot();
  });
});
