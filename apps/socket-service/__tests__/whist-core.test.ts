/**
 * Whist — pure core tests. Covers §9 edge cases + property tests + snapshot.
 */

import {
  newGame,
  applyAction,
  legalActions,
  legalPlayCardIds,
  getPublicView,
  DEFAULT_CONFIG,
  type Card,
  type GameState,
  type PlayerState,
  type Partnership,
  type WhistConfig,
  type Rank,
  type Suit,
  type Trick,
} from '../src/games/whist/core';

let cardCounter = 0;
function mkCard(rank: Rank, suit: Suit, suffix = ''): Card {
  return { rank, suit, id: `${rank}${suit}${suffix}${cardCounter++}` };
}

function setupState(
  hands: Record<string, Card[]>,
  opts: {
    trumpSuit?: Suit | null;
    currentTrick?: Trick | null;
    completedTricks?: Trick[];
    currentPlayerIndex?: number;
    dealerIndex?: number;
    config?: Partial<WhistConfig>;
    partnerships?: Partnership[];
    phase?: GameState['phase'];
    turnUpCard?: Card | null;
    dealerHasPickedUpTurnUp?: boolean;
  } = {},
): GameState {
  const playerIds = ['p1', 'p2', 'p3', 'p4'];
  const players: PlayerState[] = playerIds.map((id, i) => ({
    id,
    seat: i as 0 | 1 | 2 | 3,
    partnershipId: i % 2 === 0 ? 'NS' : 'EW',
    hand: hands[id] ?? [],
  }));
  const partnerships: Partnership[] = opts.partnerships ?? [
    { id: 'NS', playerIds: ['p1', 'p3'], score: 0, tricksThisHand: 0, gamesWon: 0 },
    { id: 'EW', playerIds: ['p2', 'p4'], score: 0, tricksThisHand: 0, gamesWon: 0 },
  ];
  return {
    players,
    partnerships,
    dealerIndex: opts.dealerIndex ?? 3,
    trumpSuit: opts.trumpSuit ?? null,
    turnUpCard: opts.turnUpCard ?? null,
    currentTrick: opts.currentTrick ?? { ledSuit: null, plays: [], winnerId: null },
    completedTricks: opts.completedTricks ?? [],
    currentPlayerIndex: opts.currentPlayerIndex ?? 0,
    phase: opts.phase ?? 'play',
    roundNumber: 1,
    seed: 1,
    config: { ...DEFAULT_CONFIG, ...(opts.config ?? {}) },
    roundAcks: [],
    dealerHasPickedUpTurnUp: opts.dealerHasPickedUpTurnUp ?? false,
    rubberWinnerId: null,
  };
}

function finalTrick(state: GameState, perPlayerCards: Card[]): GameState {
  // Give each player exactly one card, then play all four to finish the hand.
  let s: GameState = {
    ...state,
    players: state.players.map((p, i) => ({ ...p, hand: [perPlayerCards[i]!] })),
    currentTrick: { ledSuit: null, plays: [], winnerId: null },
    currentPlayerIndex: (state.dealerIndex + 1) % 4,
  };
  for (let i = 0; i < 4; i++) {
    const current = s.players[s.currentPlayerIndex]!;
    s = applyAction(s, {
      kind: 'playCard', playerId: current.id, cardId: current.hand[0]!.id,
    });
  }
  return s;
}

// ─── Setup ─────────────────────────────────────────────────────────

describe('Whist — setup', () => {
  it('newGame deals 13 cards per player + sets trump from dealer turn-up', () => {
    const state = newGame(['p1', 'p2', 'p3', 'p4'], {}, 42);
    for (const p of state.players) expect(p.hand).toHaveLength(13);
    expect(state.trumpSuit).not.toBeNull();
    expect(state.turnUpCard).not.toBeNull();
    // turn-up is the dealer's last dealt card, which lives in their hand.
    const dealer = state.players[state.dealerIndex]!;
    expect(dealer.hand[dealer.hand.length - 1]!.id).toBe(state.turnUpCard!.id);
  });

  it('no-trump variant skips turn-up (9)', () => {
    const state = newGame(['p1', 'p2', 'p3', 'p4'], { noTrumpVariant: true }, 42);
    expect(state.trumpSuit).toBeNull();
    expect(state.turnUpCard).toBeNull();
  });

  it('rejects ≠ 4 players', () => {
    expect(() => newGame(['a', 'b'], {}, 1)).toThrow();
    expect(() => newGame(['a', 'b', 'c', 'd', 'e'], {}, 1)).toThrow();
  });

  it('partnerships seat 0/2 = NS, 1/3 = EW', () => {
    const state = newGame(['p1', 'p2', 'p3', 'p4'], {}, 1);
    expect(state.players[0]!.partnershipId).toBe('NS');
    expect(state.players[1]!.partnershipId).toBe('EW');
    expect(state.players[2]!.partnershipId).toBe('NS');
    expect(state.players[3]!.partnershipId).toBe('EW');
  });

  it('leader is left of dealer', () => {
    const state = newGame(['p1', 'p2', 'p3', 'p4'], { startingDealerIndex: 3 }, 1);
    expect(state.currentPlayerIndex).toBe(0); // left of seat 3 wraps to 0
  });
});

// ─── Follow-suit §9.13 ────────────────────────────────────────────

describe('Whist — follow-suit enforcement', () => {
  it('rejects non-led-suit when holding led suit (13)', () => {
    const p2KD = mkCard('K', 'D');
    const state = setupState(
      {
        p1: [mkCard('A', 'H')],
        p2: [mkCard('5', 'H'), p2KD],
        p3: [mkCard('10', 'H')],
        p4: [mkCard('3', 'H')],
      },
      { trumpSuit: 'S', currentPlayerIndex: 0 },
    );
    const s1 = applyAction(state, { kind: 'playCard', playerId: 'p1', cardId: state.players[0]!.hand[0]!.id });
    // p2 must follow hearts — attempting to play the K♦ must throw.
    expect(() =>
      applyAction(s1, { kind: 'playCard', playerId: 'p2', cardId: p2KD.id }),
    ).toThrow(/follow/i);
  });

  it('void player may play any card (including trump)', () => {
    const trumpCard = mkCard('2', 'S');
    const state = setupState(
      {
        p1: [mkCard('A', 'H')],
        p2: [trumpCard, mkCard('K', 'D')],
        p3: [mkCard('10', 'H')],
        p4: [mkCard('3', 'H')],
      },
      { trumpSuit: 'S', currentPlayerIndex: 0 },
    );
    const s1 = applyAction(state, { kind: 'playCard', playerId: 'p1', cardId: state.players[0]!.hand[0]!.id });
    // p2 has no hearts, may play trump 2♠.
    const legal = legalPlayCardIds(s1, s1.players[1]!);
    expect(legal).toContain(trumpCard.id);
  });
});

// ─── Trick resolution + trumps §9.3 ───────────────────────────────

describe('Whist — trick resolution', () => {
  it('highest trump wins regardless of led suit (3)', () => {
    const state = setupState(
      {
        p1: [mkCard('A', 'H')],
        p2: [mkCard('2', 'S')],
        p3: [mkCard('K', 'H')],
        p4: [mkCard('3', 'H')],
      },
      { trumpSuit: 'S', currentPlayerIndex: 0 },
    );
    let s = state;
    for (let i = 0; i < 4; i++) {
      const current = s.players[s.currentPlayerIndex]!;
      s = applyAction(s, {
        kind: 'playCard', playerId: current.id, cardId: current.hand[0]!.id,
      });
    }
    // p2 plays the only trump (2♠) and wins. EW scores the trick.
    const ew = s.partnerships.find((pa) => pa.id === 'EW')!;
    expect(ew.tricksThisHand).toBe(1);
  });

  it('no trump played: highest led suit wins', () => {
    const state = setupState(
      {
        p1: [mkCard('5', 'H')],
        p2: [mkCard('A', 'H')],
        p3: [mkCard('K', 'H')],
        p4: [mkCard('3', 'H')],
      },
      { trumpSuit: 'S', currentPlayerIndex: 0 },
    );
    let s = state;
    for (let i = 0; i < 4; i++) {
      const current = s.players[s.currentPlayerIndex]!;
      s = applyAction(s, {
        kind: 'playCard', playerId: current.id, cardId: current.hand[0]!.id,
      });
    }
    // p2 plays AH (highest heart). EW scores the trick.
    const ew = s.partnerships.find((pa) => pa.id === 'EW')!;
    expect(ew.tricksThisHand).toBe(1);
  });
});

// ─── Turn-up pickup §9.4-5 ────────────────────────────────────────

describe('Whist — turn-up pickup', () => {
  it('dealer picks up turn-up on first play (4, 5)', () => {
    const state = newGame(['p1', 'p2', 'p3', 'p4'], { startingDealerIndex: 3 }, 42);
    expect(state.turnUpCard).not.toBeNull();
    expect(state.dealerHasPickedUpTurnUp).toBe(false);
    // Play out the first trick: p1 leads (seat 0), then p2 (1), p3 (2), p4 (dealer, seat 3).
    const leadCard = state.players[0]!.hand[0]!;
    let s = applyAction(state, { kind: 'playCard', playerId: 'p1', cardId: leadCard.id });
    expect(s.dealerHasPickedUpTurnUp).toBe(false);
    // Continue through p2, p3; dealer plays last.
    for (const id of ['p2', 'p3']) {
      const current = s.players.find((p) => p.id === id)!;
      const legal = legalPlayCardIds(s, current);
      s = applyAction(s, {
        kind: 'playCard', playerId: id, cardId: legal[0]!,
      });
    }
    // Now dealer (p4) plays.
    const dealer = s.players[3]!;
    const dealerLegal = legalPlayCardIds(s, dealer);
    s = applyAction(s, { kind: 'playCard', playerId: 'p4', cardId: dealerLegal[0]! });
    expect(s.dealerHasPickedUpTurnUp).toBe(true);
    expect(s.turnUpCard).toBeNull();
  });
});

// ─── Scoring §9.1-2 ───────────────────────────────────────────────

describe('Whist — scoring', () => {
  it('partnership winning 7 tricks → 1 point; other scores 0 (1)', () => {
    // Build an end-of-hand state with NS having taken 7 tricks, EW 6.
    // Mimic by seeding completedTricks with winners.
    const fakeCompleted: Trick[] = [
      ...Array.from({ length: 7 }, (_, i) => ({
        ledSuit: 'H' as Suit, plays: [], winnerId: 'p1' as string,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        ledSuit: 'H' as Suit, plays: [], winnerId: 'p2' as string,
      })),
    ];
    const partnerships: Partnership[] = [
      { id: 'NS', playerIds: ['p1', 'p3'], score: 0, tricksThisHand: 7, gamesWon: 0 },
      { id: 'EW', playerIds: ['p2', 'p4'], score: 0, tricksThisHand: 5, gamesWon: 0 },
    ];
    const state = setupState(
      {},
      {
        trumpSuit: 'S',
        completedTricks: fakeCompleted,
        partnerships,
        currentTrick: null,
        phase: 'play',
      },
    );
    // Play the final trick (tricks taken so far total 12; need one more).
    const finalCards = [mkCard('2', 'C'), mkCard('3', 'C'), mkCard('4', 'C'), mkCard('5', 'C')];
    const s = finalTrick(
      { ...state, partnerships: partnerships.map((pa) => ({ ...pa, tricksThisHand: pa.id === 'NS' ? 7 : 5 })) },
      finalCards,
    );
    // Final trick: p4 (leads clubs 5C) — wait, lead is (dealer+1)%4 = 0 in our setup → p1 leads.
    // p1 plays 2C, p2 3C, p3 4C, p4 5C. p4 wins with 5C. EW gets trick → 6.
    // NS final tricksThisHand 7 → +1 pt. EW 6 → 0.
    const ns = s.partnerships.find((pa) => pa.id === 'NS')!;
    const ew = s.partnerships.find((pa) => pa.id === 'EW')!;
    expect(ns.score).toBe(1);
    expect(ew.score).toBe(0);
  });

  it('grand slam (13 tricks) → 7 points (2)', () => {
    // A fake completed tricks all winning NS, plus final trick also NS.
    const partnerships: Partnership[] = [
      { id: 'NS', playerIds: ['p1', 'p3'], score: 0, tricksThisHand: 12, gamesWon: 0 },
      { id: 'EW', playerIds: ['p2', 'p4'], score: 0, tricksThisHand: 0, gamesWon: 0 },
    ];
    const state = setupState({}, {
      trumpSuit: 'S',
      completedTricks: Array.from({ length: 12 }, () => ({ ledSuit: 'S' as Suit, plays: [], winnerId: 'p1' })),
      partnerships, phase: 'play', currentTrick: null,
    });
    // Final trick: make p1 lead 2S, others play lower non-trump → p1 wins with trump 2S.
    const finalCards = [mkCard('2', 'S'), mkCard('3', 'H'), mkCard('4', 'C'), mkCard('5', 'D')];
    const s = finalTrick(state, finalCards);
    // NS ends with 13 tricks → 13 - 6 = 7 points.
    const ns = s.partnerships.find((pa) => pa.id === 'NS')!;
    expect(ns.score).toBe(7);
  });
});

// ─── Honors §9.6-8 ────────────────────────────────────────────────

describe('Whist — honors (optional)', () => {
  it('all 4 honors in one partnership → +4 (6)', () => {
    const honorsTricks: Trick[] = [
      {
        ledSuit: 'S', plays: [
          { playerId: 'p1', card: mkCard('A', 'S') },
          { playerId: 'p2', card: mkCard('5', 'S') },
          { playerId: 'p3', card: mkCard('K', 'S') },
          { playerId: 'p4', card: mkCard('6', 'S') },
        ], winnerId: 'p1',
      },
      {
        ledSuit: 'S', plays: [
          { playerId: 'p3', card: mkCard('Q', 'S') },
          { playerId: 'p4', card: mkCard('2', 'S') },
          { playerId: 'p1', card: mkCard('J', 'S') },
          { playerId: 'p2', card: mkCard('3', 'S') },
        ], winnerId: 'p3',
      },
    ];
    const partnerships: Partnership[] = [
      { id: 'NS', playerIds: ['p1', 'p3'], score: 0, tricksThisHand: 12, gamesWon: 0 },
      { id: 'EW', playerIds: ['p2', 'p4'], score: 0, tricksThisHand: 0, gamesWon: 0 },
    ];
    const state = setupState({}, {
      trumpSuit: 'S',
      completedTricks: [
        ...honorsTricks,
        ...Array.from({ length: 10 }, () => ({
          ledSuit: 'C' as Suit, plays: [], winnerId: 'p1' as string,
        })),
      ],
      partnerships, phase: 'play', currentTrick: null,
      config: { countHonors: true },
    });
    // Final trick: NS wins trick 13 → tricksThisHand=13 → 7pts + 4 honors = 11
    const finalCards = [mkCard('2', 'C'), mkCard('3', 'H'), mkCard('4', 'D'), mkCard('5', 'D')];
    const s = finalTrick(state, finalCards);
    const ns = s.partnerships.find((pa) => pa.id === 'NS')!;
    // NS = 13 tricks → 7 trick pts + 4 honor pts = 11 (exceeds 5 → gameOver).
    expect(ns.score).toBeGreaterThanOrEqual(11);
  });

  it('honors disabled by default (8)', () => {
    const state = setupState({}, { trumpSuit: 'S', config: {} });
    expect(state.config.countHonors).toBe(false);
  });
});

// ─── Game end §9.10-11 ────────────────────────────────────────────

describe('Whist — game end', () => {
  it('short whist: 5 points ends game (10)', () => {
    const partnerships: Partnership[] = [
      { id: 'NS', playerIds: ['p1', 'p3'], score: 4, tricksThisHand: 12, gamesWon: 0 },
      { id: 'EW', playerIds: ['p2', 'p4'], score: 0, tricksThisHand: 0, gamesWon: 0 },
    ];
    const state = setupState({}, {
      trumpSuit: 'S',
      completedTricks: Array.from({ length: 12 }, () => ({ ledSuit: 'S' as Suit, plays: [], winnerId: 'p1' })),
      partnerships, phase: 'play', currentTrick: null,
    });
    const finalCards = [mkCard('2', 'S'), mkCard('3', 'H'), mkCard('4', 'C'), mkCard('5', 'D')];
    const s = finalTrick(state, finalCards);
    // NS wins all 13 tricks → +7 → score = 11 ≥ 5 → gameOver.
    expect(s.phase).toBe('gameOver');
  });

  it('long whist: 7 points target (11)', () => {
    const partnerships: Partnership[] = [
      { id: 'NS', playerIds: ['p1', 'p3'], score: 5, tricksThisHand: 12, gamesWon: 0 },
      { id: 'EW', playerIds: ['p2', 'p4'], score: 0, tricksThisHand: 0, gamesWon: 0 },
    ];
    const state = setupState({}, {
      trumpSuit: 'S',
      completedTricks: Array.from({ length: 12 }, () => ({ ledSuit: 'S' as Suit, plays: [], winnerId: 'p1' })),
      partnerships, phase: 'play', currentTrick: null,
      config: { targetScore: 7 },
    });
    const finalCards = [mkCard('2', 'S'), mkCard('3', 'H'), mkCard('4', 'C'), mkCard('5', 'D')];
    const s = finalTrick(state, finalCards);
    expect(s.phase).toBe('gameOver'); // 5 + 7 = 12 ≥ 7
  });

  it('hand ends → handOver (not gameOver) when neither side reaches target (14)', () => {
    const partnerships: Partnership[] = [
      { id: 'NS', playerIds: ['p1', 'p3'], score: 0, tricksThisHand: 7, gamesWon: 0 },
      { id: 'EW', playerIds: ['p2', 'p4'], score: 0, tricksThisHand: 5, gamesWon: 0 },
    ];
    const state = setupState({}, {
      trumpSuit: 'S',
      completedTricks: Array.from({ length: 12 }, (_, i) =>
        ({ ledSuit: 'S' as Suit, plays: [], winnerId: i < 7 ? 'p1' : 'p2' }),
      ),
      partnerships, phase: 'play', currentTrick: null,
    });
    const finalCards = [mkCard('2', 'C'), mkCard('3', 'C'), mkCard('4', 'C'), mkCard('5', 'C')];
    const s = finalTrick(state, finalCards);
    // After final trick: NS 7 → +1 = 1; EW 6 → 0. Neither ≥ 5 → handOver.
    expect(s.phase).toBe('handOver');
  });
});

// ─── Determinism §9.16 ─────────────────────────────────────────────

describe('Whist — determinism', () => {
  it('same seed → same deal (16)', () => {
    const a = newGame(['p1', 'p2', 'p3', 'p4'], {}, 42);
    const b = newGame(['p1', 'p2', 'p3', 'p4'], {}, 42);
    for (let i = 0; i < 4; i++) {
      expect(a.players[i]!.hand.map((c) => c.id))
        .toEqual(b.players[i]!.hand.map((c) => c.id));
    }
    expect(a.trumpSuit).toBe(b.trumpSuit);
  });
});

// ─── Invariants ────────────────────────────────────────────────────

describe('Whist — invariants', () => {
  it('only one partnership scores trick points per hand (or both 0)', () => {
    // Play out a whole hand via random legal actions.
    let state = newGame(['p1', 'p2', 'p3', 'p4'], {}, 42);
    while (state.phase === 'play') {
      const current = state.players[state.currentPlayerIndex]!;
      const legal = legalActions(state, current.id);
      if (legal.length === 0) break;
      state = applyAction(state, legal[0]!);
    }
    const [ns, ew] = state.partnerships;
    // At most one partnership scored trick points this hand.
    const nsTrickPts = Math.max(0, ns!.tricksThisHand - 6);
    const ewTrickPts = Math.max(0, ew!.tricksThisHand - 6);
    expect(nsTrickPts === 0 || ewTrickPts === 0).toBe(true);
    // Tricks per hand = 13.
    expect(ns!.tricksThisHand + ew!.tricksThisHand).toBe(13);
  });
});

// ─── Public view ───────────────────────────────────────────────────

describe('Whist — public view', () => {
  it('viewer sees own hand + opponent counts + partnership scores', () => {
    const state = newGame(['p1', 'p2', 'p3', 'p4'], {}, 42);
    const view = getPublicView(state, 'p1');
    expect(view.viewerHand).toEqual(state.players[0]!.hand);
    expect(view.players[1]!.handCount).toBe(13);
    expect(view.partnerships).toHaveLength(2);
    expect(view.turnUpCard).not.toBeNull();
  });
});

// ─── Snapshot ──────────────────────────────────────────────────────

describe('Whist — snapshot', () => {
  it('seed=7 deal is stable', () => {
    const state = newGame(['p1', 'p2', 'p3', 'p4'], {}, 7);
    const shape = {
      dealer: state.dealerIndex,
      trump: state.trumpSuit,
      turnUp: state.turnUpCard ? `${state.turnUpCard.rank}${state.turnUpCard.suit}` : null,
      hands: state.players.map((p) => p.hand.map((c) => `${c.rank}${c.suit}`)),
    };
    expect(shape).toMatchSnapshot();
  });
});
