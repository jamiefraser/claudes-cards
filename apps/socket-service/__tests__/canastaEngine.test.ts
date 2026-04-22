/**
 * Canasta Engine \u2014 Hoyle's rule suite (4p / 3p / 2p variants).
 */

import {
  CanastaEngine,
  CanastaPickupError,
  canastaCardPoints,
  initialMeldMinimum,
  isWild,
  validateNewMeld,
  validateMeldExtension,
  type CanastaMeld,
  type CanastaPickupErrorCode,
  type CanastaPublicData,
} from '../src/games/canasta/engine';
import type { Card, GameConfig, GameState } from '@card-platform/shared-types';

function makeConfig(n: number): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'canasta',
    playerIds: Array.from({ length: n }, (_, i) => `p${i + 1}`),
    asyncMode: false,
    turnTimerSeconds: null,
  };
}

function c(id: string, rank: string | undefined, suit: Card['suit'] | undefined): Card {
  const vm: Record<string, number> = {
    A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    J: 11, Q: 12, K: 13,
  };
  return {
    id,
    deckType: 'standard',
    rank: rank as Card['rank'],
    suit,
    value: rank ? (vm[rank] ?? 0) : 0,
    faceUp: false,
  };
}

const JOKER = (id: string): Card => ({ id, deckType: 'standard', rank: undefined, suit: undefined, value: 0, faceUp: false });

function pd(state: GameState): CanastaPublicData {
  return state.publicData as unknown as CanastaPublicData;
}

// ===========================================================================
// Pure helpers
// ===========================================================================

describe('Canasta helpers \u2014 card values', () => {
  it('Joker = 50', () => { expect(canastaCardPoints(JOKER('j'))).toBe(50); });
  it('2s = 20 (wild)', () => { expect(canastaCardPoints(c('a','2','hearts'))).toBe(20); });
  it('Ace = 20', () => { expect(canastaCardPoints(c('a','A','clubs'))).toBe(20); });
  it('8\u2013K = 10', () => {
    for (const r of ['8','9','10','J','Q','K']) {
      expect(canastaCardPoints(c('x', r, 'hearts'))).toBe(10);
    }
  });
  it('4\u20137 = 5', () => {
    for (const r of ['4','5','6','7']) {
      expect(canastaCardPoints(c('x', r, 'hearts'))).toBe(5);
    }
  });
  it('black 3 = 5; red 3 = 100', () => {
    expect(canastaCardPoints(c('a', '3', 'clubs'))).toBe(5);
    expect(canastaCardPoints(c('a', '3', 'spades'))).toBe(5);
    expect(canastaCardPoints(c('a', '3', 'hearts'))).toBe(100);
    expect(canastaCardPoints(c('a', '3', 'diamonds'))).toBe(100);
  });
});

describe('Canasta helpers \u2014 initial-meld minimum', () => {
  it('< 0  \u2192 15', () => { expect(initialMeldMinimum(-50)).toBe(15); });
  it('0\u20131,495 \u2192 50', () => {
    expect(initialMeldMinimum(0)).toBe(50);
    expect(initialMeldMinimum(1400)).toBe(50);
  });
  it('1,500\u20132,995 \u2192 90', () => {
    expect(initialMeldMinimum(1500)).toBe(90);
    expect(initialMeldMinimum(2999)).toBe(90);
  });
  it('3,000+ \u2192 120', () => { expect(initialMeldMinimum(3000)).toBe(120); });
});

describe('Canasta helpers \u2014 isWild', () => {
  it('2s are wild', () => { expect(isWild(c('a','2','hearts'))).toBe(true); });
  it('Jokers are wild', () => { expect(isWild(JOKER('j'))).toBe(true); });
  it('naturals are not wild', () => {
    expect(isWild(c('a','7','hearts'))).toBe(false);
    expect(isWild(c('a','A','hearts'))).toBe(false);
    expect(isWild(c('a','3','clubs'))).toBe(false);
  });
});

// ===========================================================================
// Meld validation
// ===========================================================================

describe('validateNewMeld', () => {
  it('accepts 3 naturals of the same rank', () => {
    const r = validateNewMeld([c('a','7','hearts'), c('b','7','spades'), c('d','7','diamonds')]);
    expect(r.ok).toBe(true);
  });
  it('accepts 2 naturals + 1 wild', () => {
    const r = validateNewMeld([c('a','K','hearts'), c('b','K','spades'), c('c','2','clubs')]);
    expect(r.ok).toBe(true);
  });
  it('rejects < 3 cards', () => {
    const r = validateNewMeld([c('a','7','hearts'), c('b','7','spades')]);
    expect(r.ok).toBe(false);
  });
  it('rejects mixed ranks', () => {
    const r = validateNewMeld([c('a','7','hearts'), c('b','8','spades'), c('c','9','clubs')]);
    expect(r.ok).toBe(false);
  });
  it('rejects more wilds than naturals', () => {
    const r = validateNewMeld([c('a','K','hearts'), c('b','2','spades'), c('c','2','clubs'), JOKER('j')]);
    expect(r.ok).toBe(false);
  });
  it('rejects more than 3 wilds in a large meld', () => {
    const r = validateNewMeld([
      c('a','K','hearts'), c('b','K','spades'), c('c','K','clubs'), c('d','K','diamonds'),
      c('e','2','hearts'), c('f','2','spades'), c('g','2','clubs'), JOKER('j'),
    ]);
    expect(r.ok).toBe(false);
  });
  it('rejects all-wild meld', () => {
    const r = validateNewMeld([c('a','2','hearts'), c('b','2','spades'), JOKER('j')]);
    expect(r.ok).toBe(false);
  });
  it('rejects red 3 in meld', () => {
    const r = validateNewMeld([c('a','3','hearts'), c('b','3','clubs'), c('c','3','spades')]);
    expect(r.ok).toBe(false);
  });
  it('black 3 only valid when going out (no wilds)', () => {
    const base = [c('a','3','clubs'), c('b','3','spades'), c('c','3','clubs')];
    const normal = validateNewMeld(base);
    expect(normal.ok).toBe(false);
    const goingOut = validateNewMeld(base, { goingOut: true });
    expect(goingOut.ok).toBe(true);
  });
  it('black 3 with wild rejected even when going out', () => {
    const r = validateNewMeld(
      [c('a','3','clubs'), c('b','3','spades'), c('c','2','hearts')],
      { goingOut: true },
    );
    expect(r.ok).toBe(false);
  });
});

describe('validateMeldExtension', () => {
  const base: CanastaMeld = {
    rank: 'K',
    cards: [c('k1','K','hearts'), c('k2','K','spades'), c('k3','K','clubs')],
    naturals: 3,
    wilds: 0,
    isCanasta: false,
  };
  it('accepts same-rank natural', () => {
    expect(validateMeldExtension(base, [c('k4','K','diamonds')]).ok).toBe(true);
  });
  it('accepts wild when natural majority preserved', () => {
    expect(validateMeldExtension(base, [JOKER('j')]).ok).toBe(true);
  });
  it('rejects different rank natural', () => {
    expect(validateMeldExtension(base, [c('x','Q','hearts')]).ok).toBe(false);
  });
  it('rejects too many wilds (>3)', () => {
    const withWilds: CanastaMeld = { ...base, cards: [...base.cards, c('w1','2','h'as any)], naturals: 3, wilds: 1 };
    const w2: CanastaMeld = { ...withWilds, wilds: 3 };
    expect(validateMeldExtension(w2, [JOKER('j')]).ok).toBe(false);
  });
  it('rejects extension that would leave wilds \u2265 naturals', () => {
    const weak: CanastaMeld = { ...base, naturals: 2, wilds: 1, cards: [c('a','K','hearts'), c('b','K','spades'), c('c','2','clubs')] };
    expect(validateMeldExtension(weak, [JOKER('j')]).ok).toBe(false);
  });
});

// ===========================================================================
// Engine \u2014 setup
// ===========================================================================

describe("CanastaEngine \u2014 Hoyle's setup", () => {
  const engine = new CanastaEngine();

  it('rejects 1-player and 5-player configs', () => {
    expect(() => engine.startGame(makeConfig(1))).toThrow();
    expect(() => engine.startGame(makeConfig(5))).toThrow();
  });

  it('2p: deal 15 each, draw count 2, go-out requires 2 canastas', () => {
    const s = engine.startGame(makeConfig(2));
    for (const p of s.players) expect(p.hand.length).toBe(15);
    expect(pd(s).drawCount).toBe(2);
    expect(pd(s).goOutRequirement).toBe(2);
    expect(pd(s).variant).toBe('2p');
  });

  it('3p: deal 13 each, individuals, 1 canasta to go out', () => {
    const s = engine.startGame(makeConfig(3));
    for (const p of s.players) expect(p.hand.length).toBe(13);
    expect(pd(s).drawCount).toBe(1);
    expect(pd(s).goOutRequirement).toBe(1);
    expect(pd(s).meldKeys).toEqual(['p1','p2','p3']);
  });

  it('4p: deal 11 each, partnerships A (p1,p3) and B (p2,p4)', () => {
    const s = engine.startGame(makeConfig(4));
    for (const p of s.players) expect(p.hand.length).toBe(11);
    expect(pd(s).meldKeys).toEqual(['A','B']);
    expect(pd(s).drawCount).toBe(1);
    expect(pd(s).goOutRequirement).toBe(1);
  });

  it('no red 3 is ever left in a hand after dealing', () => {
    for (let i = 0; i < 10; i++) {
      const s = engine.startGame(makeConfig(4));
      for (const p of s.players) {
        for (const card of p.hand) {
          const isRed3 = card.rank === '3' && (card.suit === 'hearts' || card.suit === 'diamonds');
          expect(isRed3).toBe(false);
        }
      }
    }
  });

  it('deck totals still 108 when red 3s included', () => {
    // Validate by reconstructing totals from the starting state: hands +
    // drawPile + discardPile + redThrees + dealer's turn-up card = 108.
    const s = engine.startGame(makeConfig(4));
    const total =
      s.players.reduce((sum, p) => sum + p.hand.length, 0) +
      pd(s).drawPile.length +
      pd(s).discardPile.length +
      Object.values(pd(s).redThrees).reduce((sum, arr) => sum + arr.length, 0);
    expect(total).toBe(108);
  });
});

// ===========================================================================
// Engine \u2014 turn cycle
// ===========================================================================

describe('CanastaEngine \u2014 turn cycle', () => {
  const engine = new CanastaEngine();

  it('draw adds 1 card in 3p/4p and 2 cards in 2p', () => {
    const s4 = engine.startGame(makeConfig(4));
    const pid4 = s4.currentTurn!;
    const h4before = s4.players.find((p) => p.playerId === pid4)!.hand.length;
    const s4after = engine.applyAction(s4, pid4, { type: 'draw' });
    const h4after = s4after.players.find((p) => p.playerId === pid4)!.hand.length;
    expect(h4after - h4before).toBe(1);

    const s2 = engine.startGame(makeConfig(2));
    const pid2 = s2.currentTurn!;
    const h2before = s2.players.find((p) => p.playerId === pid2)!.hand.length;
    const s2after = engine.applyAction(s2, pid2, { type: 'draw' });
    const h2after = s2after.players.find((p) => p.playerId === pid2)!.hand.length;
    expect(h2after - h2before).toBe(2);
  });

  it('cannot draw twice in one turn', () => {
    const s = engine.startGame(makeConfig(4));
    const pid = s.currentTurn!;
    const s1 = engine.applyAction(s, pid, { type: 'draw' });
    expect(() => engine.applyAction(s1, pid, { type: 'draw' })).toThrow();
  });

  it('cannot discard before drawing', () => {
    const s = engine.startGame(makeConfig(4));
    const pid = s.currentTurn!;
    const card = s.players.find((p) => p.playerId === pid)!.hand[0]!;
    expect(() =>
      engine.applyAction(s, pid, { type: 'discard', cardIds: [card.id] }),
    ).toThrow();
  });

  it('cannot discard a red 3 (they are bonus cards not in hand)', () => {
    const s = engine.startGame(makeConfig(4));
    const pid = s.currentTurn!;
    const drawn = engine.applyAction(s, pid, { type: 'draw' });
    const player = drawn.players.find((p) => p.playerId === pid)!;
    // Inject a red 3 into the hand to cover the error path.
    const withRed3 = {
      ...drawn,
      players: drawn.players.map((p) =>
        p.playerId === pid
          ? { ...p, hand: [...p.hand, c('sneak-red3', '3', 'hearts')] }
          : p,
      ),
    };
    expect(() =>
      engine.applyAction(withRed3, pid, { type: 'discard', cardIds: ['sneak-red3'] }),
    ).toThrow(/red 3/i);
  });

  it('turn advances to the next player after discard', () => {
    const s = engine.startGame(makeConfig(4));
    const order = s.players.map((p) => p.playerId);
    const pid = s.currentTurn!;
    const drawn = engine.applyAction(s, pid, { type: 'draw' });
    const player = drawn.players.find((p) => p.playerId === pid)!;
    const card = player.hand[player.hand.length - 1]!; // discard something safe
    const after = engine.applyAction(drawn, pid, { type: 'discard', cardIds: [card.id] });
    expect(after.currentTurn).toBe(order[(order.indexOf(pid) + 1) % order.length]);
  });
});

// ===========================================================================
// Engine \u2014 melds & initial-meld minimum
// ===========================================================================

function seedHand(state: GameState, pid: string, hand: Card[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.playerId === pid ? { ...p, hand } : p)),
  };
}

function forceMeldPhase(state: GameState, pid: string): GameState {
  return {
    ...state,
    currentTurn: pid,
    publicData: { ...(state.publicData as Record<string, unknown>), gamePhase: 'meld-discard' },
  };
}

describe('CanastaEngine \u2014 melds', () => {
  const engine = new CanastaEngine();

  it('plays a simple 3-card meld that clears the initial-meld threshold', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    // Aces = 20 each = 60 for three aces, clears the 50-point threshold.
    const hand = [
      c('a1','A','hearts'), c('a2','A','spades'), c('a3','A','clubs'),
      c('x1','4','hearts'), c('x2','4','spades'),
    ];
    const state = forceMeldPhase(seedHand(start, pid, hand), pid);
    const after = engine.applyAction(state, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: ['a1','a2','a3'] }] },
    });
    const newPlayer = after.players.find((p) => p.playerId === pid)!;
    expect(newPlayer.hand.map((c) => c.id).sort()).toEqual(['x1','x2']);
    expect(pd(after).melds.A).toHaveLength(1);
    expect(pd(after).initialMeldDone.A).toBe(true);
  });

  it("rejects an initial meld below the 50-point threshold", () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('a1','4','hearts'), c('a2','4','spades'), c('a3','4','clubs'),
      c('x1','9','hearts'),
    ];
    const state = forceMeldPhase(seedHand(start, pid, hand), pid);
    expect(() => engine.applyAction(state, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: ['a1','a2','a3'] }] },
    })).toThrow(/Initial meld 15 < required 50/);
  });

  it('extends an existing meld after initial meld complete', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('a1','A','hearts'), c('a2','A','spades'), c('a3','A','clubs'),
      c('a4','A','diamonds'),
    ];
    const state = forceMeldPhase(seedHand(start, pid, hand), pid);
    const afterInitial = engine.applyAction(state, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: ['a1','a2','a3'] }] },
    });
    const extended = engine.applyAction(afterInitial, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: ['a4'], extend: 'A' }] },
    });
    const newMeld = pd(extended).melds.A![0]!;
    expect(newMeld.naturals).toBe(4);
  });

  it('a 7-card meld promotes to a canasta (natural)', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('k1','K','hearts'), c('k2','K','spades'), c('k3','K','clubs'),
      c('k4','K','diamonds'), c('k5','K','hearts'), c('k6','K','spades'), c('k7','K','clubs'),
    ];
    const state = forceMeldPhase(seedHand(start, pid, hand), pid);
    const after = engine.applyAction(state, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: hand.map((x) => x.id) }] },
    });
    const m = pd(after).melds.A![0]!;
    expect(m.isCanasta).toBe(true);
    expect(m.canastaType).toBe('natural');
  });

  it('a 7-card meld with wilds is a mixed canasta', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('k1','K','hearts'), c('k2','K','spades'), c('k3','K','clubs'),
      c('k4','K','diamonds'), c('k5','K','hearts'),
      c('w1','2','hearts'), c('w2','2','spades'),
    ];
    const state = forceMeldPhase(seedHand(start, pid, hand), pid);
    const after = engine.applyAction(state, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: hand.map((x) => x.id) }] },
    });
    const m = pd(after).melds.A![0]!;
    expect(m.isCanasta).toBe(true);
    expect(m.canastaType).toBe('mixed');
  });
});

// ===========================================================================
// Engine \u2014 going out and scoring
// ===========================================================================

describe('CanastaEngine \u2014 going out & scoring', () => {
  const engine = new CanastaEngine();

  it('cannot go out without a canasta', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('k1','K','hearts'), c('k2','K','spades'), c('k3','K','clubs'),
      c('bye','9','hearts'),
    ];
    const stateBase = forceMeldPhase(seedHand(start, pid, hand), pid);
    // Pretend initial meld is already done so a 30-pt K-K-K meld is legal.
    const prev = pd(stateBase);
    const state: GameState = {
      ...stateBase,
      publicData: {
        ...prev,
        initialMeldDone: { ...prev.initialMeldDone, A: true },
      } as unknown as Record<string, unknown>,
    };
    // Lay down K-K-K (extends no canasta).
    const melded = engine.applyAction(state, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: ['k1','k2','k3'] }] },
    });
    // Attempt to discard the last card \u2014 going out without a canasta \u2192 throw.
    expect(() =>
      engine.applyAction(melded, pid, { type: 'discard', cardIds: ['bye'] }),
    ).toThrow(/canasta/i);
  });

  it('4p: going out with a natural canasta scores +500 canasta bonus + 200 concealed', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('k1','K','hearts'), c('k2','K','spades'), c('k3','K','clubs'),
      c('k4','K','diamonds'), c('k5','K','hearts'), c('k6','K','spades'), c('k7','K','clubs'),
      c('bye','5','hearts'),
    ];
    const state0 = forceMeldPhase(seedHand(start, pid, hand), pid);
    const pd0 = pd(state0);
    // Seed A near the win threshold so the hand-end triggers game-over.
    const cleared: CanastaPublicData = {
      ...pd0,
      redThrees: { ...pd0.redThrees, A: [], B: [] },
      initialMeldDone: { A: false, B: false },
      melds: { A: [], B: [] },
      scores: { A: 4300, B: 0 },
    };
    const cleanState: GameState = {
      ...state0,
      players: state0.players.map((p) => (p.playerId === pid ? p : { ...p, hand: [] })),
      publicData: cleared as unknown as Record<string, unknown>,
    };

    const melded = engine.applyAction(cleanState, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: ['k1','k2','k3','k4','k5','k6','k7'] }] },
    });
    const endState = engine.applyAction(melded, pid, { type: 'discard', cardIds: ['bye'] });

    // 4300 + 500 canasta + 200 concealed + 70 meld = 5070 \u2192 game ends.
    expect(endState.phase).toBe('ended');
    expect(pd(endState).scores.A).toBe(5070);
  });

  it('hand-end without reaching 5000 deals a new hand (game continues)', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('k1','K','hearts'), c('k2','K','spades'), c('k3','K','clubs'),
      c('k4','K','diamonds'), c('k5','K','hearts'), c('k6','K','spades'), c('k7','K','clubs'),
      c('bye','5','hearts'),
    ];
    const state0 = forceMeldPhase(seedHand(start, pid, hand), pid);
    const pd0 = pd(state0);
    const cleared: CanastaPublicData = {
      ...pd0,
      redThrees: { ...pd0.redThrees, A: [], B: [] },
      initialMeldDone: { A: false, B: false },
      melds: { A: [], B: [] },
      scores: { A: 0, B: 0 },
    };
    const cleanState: GameState = {
      ...state0,
      players: state0.players.map((p) => (p.playerId === pid ? p : { ...p, hand: [] })),
      publicData: cleared as unknown as Record<string, unknown>,
    };
    const melded = engine.applyAction(cleanState, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: ['k1','k2','k3','k4','k5','k6','k7'] }] },
    });
    const after = engine.applyAction(melded, pid, { type: 'discard', cardIds: ['bye'] });
    expect(after.phase).toBe('playing');
    // Every player has a fresh hand.
    for (const p of after.players) expect(p.hand.length).toBe(11);
    // Running scores preserved (A = 770).
    expect(pd(after).scores.A).toBe(770);
  });

  it('2p: needs TWO canastas to go out', () => {
    const start = engine.startGame(makeConfig(2));
    const pid = 'p1';
    const hand = [
      c('k1','K','hearts'), c('k2','K','spades'), c('k3','K','clubs'),
      c('k4','K','diamonds'), c('k5','K','hearts'), c('k6','K','spades'), c('k7','K','clubs'),
      c('bye','5','hearts'),
    ];
    const state0 = forceMeldPhase(seedHand(start, pid, hand), pid);
    const pd0 = pd(state0);
    const cleared: CanastaPublicData = {
      ...pd0,
      redThrees: { ...pd0.redThrees, p1: [], p2: [] },
      initialMeldDone: { p1: false, p2: false },
      melds: { p1: [], p2: [] },
    };
    const cleanState: GameState = {
      ...state0,
      players: state0.players.map((p) => (p.playerId === pid ? p : { ...p, hand: [] })),
      publicData: cleared as unknown as Record<string, unknown>,
    };
    const melded = engine.applyAction(cleanState, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: hand.slice(0, 7).map((x) => x.id) }] },
    });
    expect(() =>
      engine.applyAction(melded, pid, { type: 'discard', cardIds: ['bye'] }),
    ).toThrow(/2 canasta/);
  });

  it('red 3 bonus: 100 each when team has melded', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const state0 = forceMeldPhase(
      seedHand(start, pid, [
        c('k1','K','hearts'), c('k2','K','spades'), c('k3','K','clubs'),
        c('k4','K','diamonds'), c('k5','K','hearts'), c('k6','K','spades'), c('k7','K','clubs'),
        c('bye','5','hearts'),
      ]),
      pid,
    );
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      redThrees: { ...pd0.redThrees, A: [c('r3','3','hearts')], B: [] },
      initialMeldDone: { A: false, B: false },
      melds: { A: [], B: [] },
    };
    const state: GameState = {
      ...state0,
      players: state0.players.map((p) => (p.playerId === pid ? p : { ...p, hand: [] })),
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    const melded = engine.applyAction(state, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: ['k1','k2','k3','k4','k5','k6','k7'] }] },
    });
    const end = engine.applyAction(melded, pid, { type: 'discard', cardIds: ['bye'] });
    // 500 canasta + 200 concealed + 70 meld + 100 red 3 = 870.
    expect(pd(end).scores.A).toBe(870);
  });

  it('red-3 all-four bonus = 800', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const state0 = forceMeldPhase(
      seedHand(start, pid, [
        c('k1','K','hearts'), c('k2','K','spades'), c('k3','K','clubs'),
        c('k4','K','diamonds'), c('k5','K','hearts'), c('k6','K','spades'), c('k7','K','clubs'),
        c('bye','5','hearts'),
      ]),
      pid,
    );
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      redThrees: {
        ...pd0.redThrees,
        A: [
          c('r1','3','hearts'),
          c('r2','3','diamonds'),
          c('r3','3','hearts'),
          c('r4','3','diamonds'),
        ],
        B: [],
      },
      initialMeldDone: { A: false, B: false },
      initialMeldDoneAtTurnStart: { A: false, B: false },
      melds: { A: [], B: [] },
    };
    const state: GameState = {
      ...state0,
      players: state0.players.map((p) => (p.playerId === pid ? p : { ...p, hand: [] })),
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    const melded = engine.applyAction(state, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: ['k1','k2','k3','k4','k5','k6','k7'] }] },
    });
    const end = engine.applyAction(melded, pid, { type: 'discard', cardIds: ['bye'] });
    // 500 canasta + 200 concealed + 70 meld + 800 all-four-red-3 = 1570.
    expect(pd(end).scores.A).toBe(1570);
  });

  it('red 3 penalty: team with no meld LOSES the red-3 value at hand end', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const state0 = forceMeldPhase(
      seedHand(start, pid, [
        c('k1','K','hearts'), c('k2','K','spades'), c('k3','K','clubs'),
        c('k4','K','diamonds'), c('k5','K','hearts'), c('k6','K','spades'), c('k7','K','clubs'),
        c('bye','5','hearts'),
      ]),
      pid,
    );
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      redThrees: { ...pd0.redThrees, A: [], B: [c('rr','3','hearts')] },
      initialMeldDone: { A: false, B: false },
      melds: { A: [], B: [] },
    };
    const state = { ...state0, publicData: cleaned as unknown as Record<string, unknown> };

    const melded = engine.applyAction(state, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: ['k1','k2','k3','k4','k5','k6','k7'] }] },
    });
    const end = engine.applyAction(melded, pid, { type: 'discard', cardIds: ['bye'] });
    // Side B has a red 3 but no melds \u2192 \u2212100. Plus: subtract other p2/p4 hand
    // deadwood that happened to be in the random deal. We only assert the
    // penalty is subtracted, not the exact final.
    expect(pd(end).scores.B).toBeLessThan(0);
  });
});

// ===========================================================================
// Engine \u2014 taking the discard pile
// ===========================================================================

function discardStateForTake(
  engine: CanastaEngine,
  opts: {
    top: Card;
    handForPid: Card[];
    frozen?: boolean;
    initialMeldDone?: boolean;
    existingMeld?: CanastaMeld;
  },
): { state: GameState; pid: string } {
  const start = engine.startGame(makeConfig(4));
  const pid = 'p1';
  const state0 = seedHand(start, pid, opts.handForPid);
  const pd0 = pd(state0);
  const cleaned: CanastaPublicData = {
    ...pd0,
    discardPile: [{ ...opts.top, faceUp: true }],
    discardTop: { ...opts.top, faceUp: true },
    discardFrozen: !!opts.frozen,
    initialMeldDone: { A: !!opts.initialMeldDone, B: false },
    initialMeldDoneAtTurnStart: { A: !!opts.initialMeldDone, B: false },
    melds: {
      A: opts.existingMeld ? [opts.existingMeld] : [],
      B: [],
    },
  };
  return {
    pid,
    state: {
      ...state0,
      currentTurn: pid,
      publicData: cleaned as unknown as Record<string, unknown>,
    },
  };
}

describe('CanastaEngine \u2014 take-discard', () => {
  const engine = new CanastaEngine();

  it('cannot take pile when top is a black 3', () => {
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','3','clubs'),
      handForPid: [c('k1','K','hearts'), c('k2','K','spades')],
    });
    expect(() =>
      engine.applyAction(state, pid, { type: 'take-discard' }),
    ).toThrow(/black 3/i);
  });

  it('cannot take pile when top is a wild card', () => {
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','2','clubs'),
      handForPid: [c('k1','K','hearts'), c('k2','K','spades')],
    });
    expect(() =>
      engine.applyAction(state, pid, { type: 'take-discard' }),
    ).toThrow(/wild/i);
  });

  it('unfrozen take: extends an existing meld with just the top card', () => {
    const existing: CanastaMeld = {
      rank: 'K',
      cards: [c('e1','K','hearts'), c('e2','K','spades'), c('e3','K','clubs')],
      naturals: 3,
      wilds: 0,
      isCanasta: false,
    };
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [c('h1','9','hearts'), c('h2','9','spades')],
      frozen: false,
      initialMeldDone: true,
      existingMeld: existing,
    });
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: { useCardIds: [] },
    });
    const meld = pd(after).melds.A![0]!;
    expect(meld.naturals).toBe(4);
    expect(pd(after).discardTop).toBeNull();
  });

  it('frozen take: requires two natural matches from hand', () => {
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [c('h1','K','hearts'), c('w','2','clubs')],
      frozen: true,
      initialMeldDone: false,
    });
    expect(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: ['h1','w'] },
      }),
    ).toThrow(/natural matches/i);
  });

  it('frozen take succeeds with two naturals + clears initial meld', () => {
    // Initial-meld threshold for A is 50. 3 Kings (any mix) in the new meld
    // total 30 card-points \u2014 NOT enough. Seed a prior score so threshold is 15.
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('h1','K','hearts'), c('h2','K','spades'), c('h3','9','hearts'),
    ];
    const state0 = seedHand(start, pid, hand);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      discardPile: [
        c('pc1','2','hearts'),
        c('top','K','diamonds'),
      ],
      discardTop: c('top','K','diamonds'),
      discardFrozen: true,
      scoresPriorHand: { ...pd0.scoresPriorHand, A: -1 }, // threshold drops to 15
      initialMeldDone: { A: false, B: false },
      initialMeldDoneAtTurnStart: { A: false, B: false },
      melds: { A: [], B: [] },
    };
    const state: GameState = {
      ...state0,
      currentTurn: pid,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: { useCardIds: ['h1','h2'] },
    });
    // New meld of 3 Kings. Hand gained the pile cards under the top (1 wild).
    const sideMelds = pd(after).melds.A!;
    expect(sideMelds).toHaveLength(1);
    expect(sideMelds[0]!.naturals).toBe(3);
    const player = after.players.find((p) => p.playerId === pid)!;
    // Hand now has 9H (untouched) + the wild from under the top.
    expect(player.hand.map((c) => c.id).sort()).toEqual(['h3','pc1'].sort());
  });
});

// ===========================================================================
// Engine \u2014 freezing the pile by discarding a wild
// ===========================================================================

describe('CanastaEngine \u2014 freeze-by-wild', () => {
  const engine = new CanastaEngine();

  it('discarding a wild permanently freezes the pile', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = start.currentTurn!;
    const drawn = engine.applyAction(start, pid, { type: 'draw' });
    const player = drawn.players.find((p) => p.playerId === pid)!;
    const newHand = [
      ...player.hand,
      c('wild','2','hearts'),
    ];
    const mutated = {
      ...drawn,
      players: drawn.players.map((p) =>
        p.playerId === pid ? { ...p, hand: newHand } : p,
      ),
    };
    const after = engine.applyAction(mutated, pid, {
      type: 'discard',
      cardIds: ['wild'],
    });
    expect(pd(after).discardFrozen).toBe(true);
    expect(pd(after).discardTop!.rank).toBe('2');
  });
});

// ===========================================================================
// Pickup — stable error codes (batch 1)
// Shared helpers (seedHand, forceMeldPhase, discardStateForTake) live above.
// ===========================================================================

/**
 * Grab the `.code` off a thrown CanastaPickupError. Asserts the throw shape
 * too so a regression where we revert to plain Error surfaces immediately.
 */
function expectPickupCode(fn: () => void): CanastaPickupErrorCode {
  try {
    fn();
  } catch (err) {
    if (!(err instanceof CanastaPickupError)) {
      throw new Error(`Expected CanastaPickupError, got ${String(err)}`);
    }
    return err.code;
  }
  throw new Error('Expected function to throw, but it did not');
}

describe('CanastaEngine — pickup error codes', () => {
  const engine = new CanastaEngine();

  it('EMPTY_PILE when the discard pile has no top card', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const state0 = seedHand(start, pid, [c('k1','K','hearts'), c('k2','K','spades')]);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      discardPile: [],
      discardTop: null,
      discardFrozen: false,
    };
    const state: GameState = {
      ...state0,
      currentTurn: pid,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    const code = expectPickupCode(() =>
      engine.applyAction(state, pid, { type: 'take-discard' }),
    );
    expect(code).toBe('EMPTY_PILE');
  });

  it('BLOCKED_BLACK_THREE when a black 3 sits on top', () => {
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','3','clubs'),
      handForPid: [c('k1','K','hearts'), c('k2','K','spades')],
    });
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, { type: 'take-discard' }),
    )).toBe('BLOCKED_BLACK_THREE');
  });

  it('BLOCKED_WILD_ON_TOP for a wild (2 or joker) on top', () => {
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','2','clubs'),
      handForPid: [c('k1','K','hearts'), c('k2','K','spades')],
    });
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, { type: 'take-discard' }),
    )).toBe('BLOCKED_WILD_ON_TOP');
  });

  it('BLOCKED_RED_THREE defensively blocks a red 3 on top', () => {
    // Red 3s are normally laid down on draw and never land on the discard
    // pile. This is a defensive guard that a corrupted state can't be
    // picked up silently (spec E1 / Step 1).
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','3','hearts'),
      handForPid: [c('k1','K','hearts'), c('k2','K','spades')],
    });
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, { type: 'take-discard' }),
    )).toBe('BLOCKED_RED_THREE');
  });

  it('FROZEN_WILD_MATCH_FORBIDDEN when selecting a wild against a frozen pile', () => {
    // Hand has one natural K and one wild. Frozen rules require TWO naturals
    // from hand; choosing the wild is specifically forbidden.
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [c('h1','K','hearts'), c('w','2','clubs')],
      frozen: true,
      initialMeldDone: false,
    });
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: ['h1','w'] },
      }),
    )).toBe('FROZEN_WILD_MATCH_FORBIDDEN');
  });

  it('NO_MATCHING_CARD when frozen pickup has only one natural of the rank', () => {
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [c('h1','K','hearts'), c('h2','9','hearts')],
      frozen: true,
      initialMeldDone: false,
    });
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: ['h1','h2'] },
      }),
    )).toBe('NO_MATCHING_CARD');
  });

  it('WILD_ONLY_MATCH_FORBIDDEN when unfrozen pickup uses only wilds from hand', () => {
    // Side has made its initial meld (pile unfrozen for them) but has no
    // existing K meld to extend, and the player tries to form a new meld
    // using only wilds from hand with the top K. That produces 1 natural
    // + 2 wilds which fails the natural-majority rule — surface the
    // specific WILD_ONLY_MATCH_FORBIDDEN code rather than MELD_STRUCTURE.
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [c('w1','2','clubs'), c('w2','2','hearts')],
      frozen: false,
      initialMeldDone: true,
    });
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: ['w1','w2'] },
      }),
    )).toBe('WILD_ONLY_MATCH_FORBIDDEN');
  });

  it('NO_MATCHING_CARD when unfrozen and hand has no natural of the top rank', () => {
    // Side has already melded (unfrozen) but no existing K meld. Hand has
    // a natural 9 + a wild — no K match possible. Specifically NO_MATCHING,
    // not WILD_ONLY (we have a natural in the proposed meld, just wrong rank).
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [c('h1','9','hearts'), c('w','2','clubs')],
      frozen: false,
      initialMeldDone: true,
    });
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: ['h1','w'] },
      }),
    )).toBe('NO_MATCHING_CARD');
  });

  it('INITIAL_MELD_NOT_MET when pickup does not reach the threshold', () => {
    // Fresh side (has_made_initial_meld = false). A new 3-K meld is 30 pts;
    // threshold is 50 (default for score ≥ 0). No extras declared.
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [c('h1','K','hearts'), c('h2','K','spades')],
      frozen: true,
      initialMeldDone: false,
    });
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: ['h1','h2'] },
      }),
    )).toBe('INITIAL_MELD_NOT_MET');
  });
});

// ===========================================================================
// Pickup — merge same-rank melds on frozen pickup (E6)
// ===========================================================================

describe('CanastaEngine — merge same-rank melds on frozen pickup', () => {
  const engine = new CanastaEngine();

  it('frozen pickup with an existing same-rank meld merges into one', () => {
    // Scenario: side already has a 3-card K meld on the table. Pile is
    // frozen (discardFrozen = true, and/or initial-meld not done — but here
    // we set initialMeldDone so only discardFrozen freezes). Player takes
    // the pile with two naturals, forming a second K meld. The engine
    // must merge the two into one meld of 6+ cards and preserve invariants.
    const existing: CanastaMeld = {
      rank: 'K',
      cards: [c('e1','K','hearts'), c('e2','K','spades'), c('e3','K','clubs')],
      naturals: 3,
      wilds: 0,
      isCanasta: false,
    };
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [c('h1','K','diamonds'), c('h2','K','hearts'), c('bye','9','hearts')];
    const state0 = seedHand(start, pid, hand);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      discardPile: [c('pc1','5','hearts'), c('top','K','clubs')],
      discardTop: c('top','K','clubs'),
      discardFrozen: true,
      initialMeldDone: { A: true, B: false },
      initialMeldDoneAtTurnStart: { A: true, B: false },
      melds: { A: [existing], B: [] },
    };
    const state: GameState = {
      ...state0,
      currentTurn: pid,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: { useCardIds: ['h1','h2'] },
    });
    const sideMelds = pd(after).melds.A!;
    expect(sideMelds).toHaveLength(1);
    expect(sideMelds[0]!.naturals).toBe(6);
    expect(sideMelds[0]!.wilds).toBe(0);
    // 6 cards → not yet a canasta.
    expect(sideMelds[0]!.isCanasta).toBe(false);
  });

  it('merge becomes a natural canasta when combined size hits 7', () => {
    const existing: CanastaMeld = {
      rank: '7',
      cards: [
        c('e1','7','hearts'), c('e2','7','spades'),
        c('e3','7','clubs'), c('e4','7','diamonds'),
      ],
      naturals: 4,
      wilds: 0,
      isCanasta: false,
    };
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [c('h1','7','hearts'), c('h2','7','spades'), c('bye','9','hearts')];
    const state0 = seedHand(start, pid, hand);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      discardPile: [c('pc1','5','hearts'), c('top','7','clubs')],
      discardTop: c('top','7','clubs'),
      discardFrozen: true,
      initialMeldDone: { A: true, B: false },
      initialMeldDoneAtTurnStart: { A: true, B: false },
      melds: { A: [existing], B: [] },
    };
    const state: GameState = {
      ...state0,
      currentTurn: pid,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: { useCardIds: ['h1','h2'] },
    });
    const sideMelds = pd(after).melds.A!;
    expect(sideMelds).toHaveLength(1);
    expect(sideMelds[0]!.isCanasta).toBe(true);
    expect(sideMelds[0]!.canastaType).toBe('natural');
  });
});

// ===========================================================================
// Pickup — E19 undischargeable-hand guard
// ===========================================================================

describe('CanastaEngine — undischargeable-hand guard', () => {
  const engine = new CanastaEngine();

  it('rejects a pickup that leaves the player with no card to discard', () => {
    // Construct a scenario: pile is just the top card (no cards below),
    // and hand has exactly the two naturals needed for the new meld. After
    // pickup: hand = 0, no canasta yet → cannot go out, cannot discard.
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [c('h1','K','hearts'), c('h2','K','spades')];
    const state0 = seedHand(start, pid, hand);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      discardPile: [c('top','K','diamonds')],
      discardTop: c('top','K','diamonds'),
      discardFrozen: true,
      scoresPriorHand: { ...pd0.scoresPriorHand, A: -1 },
      initialMeldDone: { A: false, B: false },
      initialMeldDoneAtTurnStart: { A: false, B: false },
      melds: { A: [], B: [] },
    };
    const state: GameState = {
      ...state0,
      currentTurn: pid,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: ['h1','h2'] },
      }),
    )).toBe('WOULD_LEAVE_UNDISCHARGEABLE_HAND');
  });
});

// ===========================================================================
// Pickup — atomicity: rejection at any point leaves state byte-identical
// ===========================================================================

describe('CanastaEngine — pickup atomicity', () => {
  const engine = new CanastaEngine();

  it('rejected pickup does not mutate melds, hand, or the discard pile', () => {
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [c('h1','K','hearts'), c('w','2','clubs')],
      frozen: true,
      initialMeldDone: false,
    });
    const snapshotHand = state.players.find((p) => p.playerId === pid)!.hand.map((c) => c.id);
    const snapshotPile = pd(state).discardPile.map((c) => c.id);
    const snapshotMelds = JSON.stringify(pd(state).melds);

    expect(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: ['h1','w'] },
      }),
    ).toThrow();

    // Original state must be untouched (applyAction is pure — it returns a
    // new state on success and throws without mutating on failure).
    expect(state.players.find((p) => p.playerId === pid)!.hand.map((c) => c.id))
      .toEqual(snapshotHand);
    expect(pd(state).discardPile.map((c) => c.id)).toEqual(snapshotPile);
    expect(JSON.stringify(pd(state).melds)).toBe(snapshotMelds);
  });
});
