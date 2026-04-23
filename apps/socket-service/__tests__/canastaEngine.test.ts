/**
 * Canasta Engine \u2014 Hoyle's rule suite (4p / 3p / 2p variants).
 */

import {
  CanastaEngine,
  CanastaPickupError,
  canTakeDiscardPile,
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

  it('multi-group action totalling >= 50 pts satisfies initial meld (DEF-002)', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    // Three 7s (5 each = 15) + three Kings (10 each = 30) + one Ace meld
    // (20 each = 60) across three groups = 105 pts total, clears 50.
    const hand = [
      c('s1','7','hearts'), c('s2','7','spades'), c('s3','7','clubs'),
      c('k1','K','hearts'), c('k2','K','spades'), c('k3','K','clubs'),
      c('a1','A','hearts'), c('a2','A','spades'), c('a3','A','clubs'),
      c('x1','4','hearts'), // leftover
    ];
    const state = forceMeldPhase(seedHand(start, pid, hand), pid);
    const after = engine.applyAction(state, pid, {
      type: 'meld',
      payload: {
        melds: [
          { cardIds: ['s1', 's2', 's3'] },
          { cardIds: ['k1', 'k2', 'k3'] },
          { cardIds: ['a1', 'a2', 'a3'] },
        ],
      },
    });
    // All three melds should appear on side A.
    expect(pd(after).melds.A).toHaveLength(3);
    expect(pd(after).initialMeldDone.A).toBe(true);
    // Only the leftover card remains.
    const newPlayer = after.players.find((p) => p.playerId === pid)!;
    expect(newPlayer.hand.map((c) => c.id)).toEqual(['x1']);
  });

  it('multi-group action below threshold is rejected', () => {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    // Three 4s (5 each = 15) + three 5s (5 each = 15) = 30 pts < 50.
    const hand = [
      c('a1','4','hearts'), c('a2','4','spades'), c('a3','4','clubs'),
      c('b1','5','hearts'), c('b2','5','spades'), c('b3','5','clubs'),
      c('x1','9','hearts'),
    ];
    const state = forceMeldPhase(seedHand(start, pid, hand), pid);
    expect(() =>
      engine.applyAction(state, pid, {
        type: 'meld',
        payload: {
          melds: [
            { cardIds: ['a1', 'a2', 'a3'] },
            { cardIds: ['b1', 'b2', 'b3'] },
          ],
        },
      }),
    ).toThrow(/Initial meld 30 < required 50/);
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

  it('WILD_ONLY_MATCH_FORBIDDEN when the player has a matching natural but selects only wilds', () => {
    // Side has made its initial meld (pile unfrozen for them) but has no
    // existing K meld to extend. The player DOES hold a natural K in
    // hand, but chose to submit only wilds as the useCardIds — the fix
    // for this user is "select the natural instead", which is why we
    // distinguish from NO_MATCHING_CARD.
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [
        c('h1','K','hearts'),
        c('w1','2','clubs'),
        c('w2','2','hearts'),
      ],
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

// ===========================================================================
// Regression: "bot freezes up after the player discards a black 3".
// Simulates the exact turn sequence the user reports, driving each engine
// action through applyAction the same way the socket handler / BotPlayer
// would. If any step throws, the strategy will fall back to rightmostDiscard
// which the engine rejects in draw phase → force-pass → sweeper reschedules
// → infinite loop. The test asserts the engine accepts a straightforward
// draw action when a black 3 is on top of the discard pile.
// ===========================================================================

describe('CanastaEngine — regression: bot draw after player discards a black 3', () => {
  const engine = new CanastaEngine();

  it('engine accepts a bare { type: "draw" } from the bot when the discard top is a black 3', () => {
    const start = engine.startGame(makeConfig(4));
    // Seat 0 is the human; seat 1 is the bot. The engine's startGame chose
    // a random first player, so we pin currentTurn to the bot and transition
    // to draw phase with a black 3 sitting on top of the discard pile.
    const botId = 'p2';
    const state0 = seedHand(start, botId, [
      c('h1','K','hearts'), c('h2','Q','spades'), c('h3','9','hearts'),
      c('h4','7','spades'), c('h5','5','hearts'), c('h6','4','clubs'),
      c('h7','A','hearts'), c('h8','10','spades'), c('h9','J','diamonds'),
      c('h10','6','clubs'), c('h11','8','hearts'),
    ]);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      gamePhase: 'draw',
      // A realistic discard pile — just the player's black-3 on top of the
      // round's opening card. Pile not frozen (black 3 doesn't freeze).
      discardPile: [c('base','5','hearts'), c('top','3','clubs')],
      discardTop: c('top','3','clubs'),
      discardFrozen: false,
    };
    const state: GameState = {
      ...state0,
      currentTurn: botId,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    // This is what CanastaBotStrategy returns in the draw phase — a bare
    // draw. If the engine throws here, the bot stalls.
    const after = engine.applyAction(state, botId, { type: 'draw' });
    expect(pd(after).gamePhase).toBe('meld-discard');
    // Stock was 108 - 4*11 - 1 base - 1 top = 59 cards.
    // After drawing drawCount=1 (4p), pile size = 58.
    expect(pd(after).drawPile.length).toBeLessThan(pd0.drawPile.length);
    // Hand grew by exactly drawCount.
    const botPlayer = after.players.find((p) => p.playerId === botId)!;
    expect(botPlayer.hand.length).toBe(12);
  });

  it('2-player canasta: engine draws drawCount=2 cards without throwing when black 3 is on top', () => {
    const start = engine.startGame({
      roomId: 'r',
      gameId: 'canasta',
      playerIds: ['p1', 'p2'],
      asyncMode: false,
      turnTimerSeconds: null,
    });
    const botId = 'p2';
    const state0 = seedHand(start, botId, [
      c('h1','K','hearts'), c('h2','Q','spades'), c('h3','9','hearts'),
      c('h4','7','spades'), c('h5','5','hearts'), c('h6','4','clubs'),
      c('h7','A','hearts'), c('h8','10','spades'), c('h9','J','diamonds'),
      c('h10','6','clubs'), c('h11','8','hearts'), c('h12','K','spades'),
      c('h13','Q','hearts'), c('h14','9','spades'), c('h15','7','hearts'),
    ]);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      gamePhase: 'draw',
      discardPile: [c('base','5','hearts'), c('top','3','spades')],
      discardTop: c('top','3','spades'),
      discardFrozen: false,
    };
    const state: GameState = {
      ...state0,
      currentTurn: botId,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    expect(() => engine.applyAction(state, botId, { type: 'draw' })).not.toThrow();
  });
});

// ===========================================================================
// Batch 2 — variant flags, natural-canasta guard, initial-meld pile-cards,
// forced pickup after stock exhaust.
// ===========================================================================

describe('CanastaEngine — default variant flags', () => {
  const engine = new CanastaEngine();

  it('startGame exposes the Hoyle defaults on publicData', () => {
    const state = engine.startGame(makeConfig(4));
    const flags = pd(state).flags;
    expect(flags.allowConvertingNaturalCanasta).toBe(false);
    expect(flags.initialMeldMayUsePileCards).toBe(false);
    expect(flags.forcedPickupAfterStockExhaust).toBe(true);
    expect(flags.requireDiscardToGoOut).toBe(true);
  });
});

describe('CanastaEngine — WOULD_CONVERT_NATURAL_CANASTA guard', () => {
  const engine = new CanastaEngine();

  function buildStateWithNaturalCanasta(): { state: GameState; pid: string } {
    // Side A has a 7-card all-natural K canasta. Pile top is a K with a wild
    // buried under it — picking it up with the natural K extends the
    // canasta, but if the handSelected brings wilds along, we convert it.
    const naturalCanasta: CanastaMeld = {
      rank: 'K',
      cards: [
        c('e1','K','hearts'), c('e2','K','spades'), c('e3','K','clubs'),
        c('e4','K','diamonds'), c('e5','K','hearts'), c('e6','K','spades'),
        c('e7','K','clubs'),
      ],
      naturals: 7,
      wilds: 0,
      isCanasta: true,
      canastaType: 'natural',
    };
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [c('w1','2','clubs'), c('bye','9','hearts'), c('bye2','5','hearts')];
    const state0 = seedHand(start, pid, hand);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      discardPile: [c('pc1','5','hearts'), c('top','K','diamonds')],
      discardTop: c('top','K','diamonds'),
      discardFrozen: false,
      initialMeldDone: { A: true, B: false },
      initialMeldDoneAtTurnStart: { A: true, B: false },
      melds: { A: [naturalCanasta], B: [] },
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

  it('pickup extension that would add a wild to a natural canasta rejects with WOULD_CONVERT_NATURAL_CANASTA', () => {
    const { state, pid } = buildStateWithNaturalCanasta();
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: ['w1'] },
      }),
    )).toBe('WOULD_CONVERT_NATURAL_CANASTA');
  });

  it('pickup extension with only naturals succeeds (no conversion)', () => {
    const { state, pid } = buildStateWithNaturalCanasta();
    // Use no hand cards — just the top K natural extends the canasta.
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: { useCardIds: [] },
    });
    const meld = pd(after).melds.A![0]!;
    expect(meld.naturals).toBe(8);
    expect(meld.wilds).toBe(0);
    expect(meld.canastaType).toBe('natural');
  });

  it('flag=true allows the conversion', () => {
    const { state, pid } = buildStateWithNaturalCanasta();
    const enabled: GameState = {
      ...state,
      publicData: {
        ...(state.publicData as Record<string, unknown>),
        flags: {
          ...pd(state).flags,
          allowConvertingNaturalCanasta: true,
        },
      } as Record<string, unknown>,
    };
    const after = engine.applyAction(enabled, pid, {
      type: 'take-discard',
      payload: { useCardIds: ['w1'] },
    });
    const meld = pd(after).melds.A![0]!;
    expect(meld.wilds).toBe(1);
    expect(meld.canastaType).toBe('mixed');
  });

  it('handleMeld extension also rejects wild-on-natural-canasta by default', () => {
    const { state, pid } = buildStateWithNaturalCanasta();
    // Switch to meld-discard phase (post-draw) so handleMeld is legal.
    const melding: GameState = {
      ...state,
      publicData: {
        ...(state.publicData as Record<string, unknown>),
        gamePhase: 'meld-discard',
      } as Record<string, unknown>,
    };
    expect(() =>
      engine.applyAction(melding, pid, {
        type: 'meld',
        payload: { melds: [{ cardIds: ['w1'], extend: 'K' }] },
      }),
    ).toThrow(/natural canasta/i);
  });
});

describe('CanastaEngine — initialMeldMayUsePileCards flag', () => {
  const engine = new CanastaEngine();

  function buildInitialMeldScenario(flagValue: boolean): { state: GameState; pid: string } {
    // Side A's initial-meld threshold is 50 (prior score = 0). Player takes
    // a K-pile with 2 K naturals → top meld = 3 Ks = 30 pts. Insufficient on
    // its own. They also declare an extra meld from hand+pile: the pile
    // buries a single 9 which, combined with two 9s from hand, forms a
    // second meld of 3 nines = 30 pts. With pile cards counted → 60 >= 50 OK.
    // Without pile cards → only the hand-original naturals count → we
    // contribute only 20 (2 × 9 nat) from the extra meld, so 30+20=50 OK too.
    // Rework: to actually demonstrate the flag's effect, we need an extra
    // meld where EXCLUDING the pile cards drops us BELOW threshold.
    // Set prior score to 1,500 so threshold = 90. Top K meld = 30 + extra
    // meld of 2 hand 9s + 1 pile 9 = 30 → total 60 if pile card counts,
    // 50 if not. With flag false → fails threshold; with flag true → passes.
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('h1','K','hearts'), c('h2','K','spades'),   // for top K
      c('n1','9','hearts'), c('n2','9','spades'),   // for extra meld
      c('keep','4','hearts'),                       // leftover → post-pickup hand non-empty
    ];
    const state0 = seedHand(start, pid, hand);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      // Pile: 9 clubs BELOW the top K.
      discardPile: [c('pc1','9','clubs'), c('top','K','diamonds')],
      discardTop: c('top','K','diamonds'),
      discardFrozen: true,
      scoresPriorHand: { ...pd0.scoresPriorHand, A: 1500 }, // threshold 90
      initialMeldDone: { A: false, B: false },
      initialMeldDoneAtTurnStart: { A: false, B: false },
      melds: { A: [], B: [] },
      flags: { ...pd0.flags, initialMeldMayUsePileCards: flagValue },
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

  // Point accounting:
  //   top K (10) + h1 K (10) + h2 K (10) = 30 pts (initialMeldPoints)
  //   extra meld [n1, n2, pc1] = three 9s @ 10 each = 30 pts gross
  //   - flag=false → only hand-original (n1,n2) count → 20 extra pts → 50 total
  //   - flag=true  → all three cards count            → 30 extra pts → 60 total
  // Threshold is 90 (prior score 1500). Both paths still fail the threshold,
  // so we assert on the specific point total that got computed — that's
  // what demonstrates the flag flipping the math.

  it('default flag (false): pile cards do NOT count toward the threshold', () => {
    const { state, pid } = buildInitialMeldScenario(false);
    try {
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: {
          useCardIds: ['h1', 'h2'],
          melds: [['n1', 'n2', 'pc1']],
        },
      });
      throw new Error('expected engine to throw INITIAL_MELD_NOT_MET');
    } catch (err) {
      if (!(err instanceof CanastaPickupError)) throw err;
      expect(err.code).toBe('INITIAL_MELD_NOT_MET');
      // 30 (top meld) + 20 (hand-only portion of extra meld) = 50.
      expect(err.message).toContain('50');
    }
  });

  it('flag=true: pile cards DO count toward the threshold', () => {
    const { state, pid } = buildInitialMeldScenario(true);
    try {
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: {
          useCardIds: ['h1', 'h2'],
          melds: [['n1', 'n2', 'pc1']],
        },
      });
      throw new Error('expected engine to throw INITIAL_MELD_NOT_MET');
    } catch (err) {
      if (!(err instanceof CanastaPickupError)) throw err;
      expect(err.code).toBe('INITIAL_MELD_NOT_MET');
      // 30 (top meld) + 30 (full extra meld incl. pile card) = 60.
      expect(err.message).toContain('60');
    }
  });
});

describe('CanastaEngine — forced pickup after stock exhaust', () => {
  const engine = new CanastaEngine();

  function buildStockEmptyState(opts: {
    canExtend: boolean;
  }): { state: GameState; pid: string } {
    const existing: CanastaMeld | null = opts.canExtend
      ? {
          rank: 'K',
          cards: [c('e1','K','hearts'), c('e2','K','spades'), c('e3','K','clubs')],
          naturals: 3,
          wilds: 0,
          isCanasta: false,
        }
      : null;
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const state0 = seedHand(start, pid, [c('h1','9','hearts'), c('h2','9','spades')]);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      drawPile: [],
      drawPileSize: 0,
      discardPile: [c('top','K','diamonds')],
      discardTop: c('top','K','diamonds'),
      discardFrozen: false,
      initialMeldDone: { A: true, B: false },
      initialMeldDoneAtTurnStart: { A: true, B: false },
      melds: { A: existing ? [existing] : [], B: [] },
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

  it('when stock is empty and an extension is available, handleDraw throws STOCK_EXHAUSTED_MUST_TAKE_PILE', () => {
    const { state, pid } = buildStockEmptyState({ canExtend: true });
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, { type: 'draw' }),
    )).toBe('STOCK_EXHAUSTED_MUST_TAKE_PILE');
  });

  it('when stock is empty and no extension is possible, handleDraw ends the hand (no forced pickup)', () => {
    const { state, pid } = buildStockEmptyState({ canExtend: false });
    const after = engine.applyAction(state, pid, { type: 'draw' });
    // endHand re-deals a new hand when the game isn't over, so roundNumber
    // increments; phase stays 'playing' unless cumulative score crosses 5000.
    expect(after.roundNumber).toBe(state.roundNumber + 1);
  });

  it('flag=false disables the forced-pickup behaviour even when extension is possible', () => {
    const { state, pid } = buildStockEmptyState({ canExtend: true });
    const disabled: GameState = {
      ...state,
      publicData: {
        ...(state.publicData as Record<string, unknown>),
        flags: { ...pd(state).flags, forcedPickupAfterStockExhaust: false },
      } as Record<string, unknown>,
    };
    // With the flag off, the draw attempt proceeds → stock empty →
    // endHand fires (existing behaviour), rolling to the next deal.
    const after = engine.applyAction(disabled, pid, { type: 'draw' });
    expect(after.roundNumber).toBe(state.roundNumber + 1);
  });
});

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

// ===========================================================================
// Batch 3 — pure pickup validator + FROZEN_EXTENSION_FORBIDDEN.
// ===========================================================================

describe('canTakeDiscardPile — pure validator', () => {
  const engine = new CanastaEngine();

  it('returns {ok: true} for a legal unfrozen extension', () => {
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
    const result = canTakeDiscardPile(state, pid, { useCardIds: [] });
    expect(result.ok).toBe(true);
  });

  it('returns the specific code for a blocked pile without mutating state', () => {
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','3','clubs'),
      handForPid: [c('k1','K','hearts'), c('k2','K','spades')],
    });
    const snapshot = JSON.stringify(state);
    const result = canTakeDiscardPile(state, pid, { useCardIds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BLOCKED_BLACK_THREE');
    // State must be byte-identical — the validator must not mutate.
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('returns FROZEN_EXTENSION_FORBIDDEN when extend=true on a frozen pile', () => {
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
      frozen: true,
      initialMeldDone: true,
      existingMeld: existing,
    });
    const result = canTakeDiscardPile(state, pid, {
      useCardIds: [],
      extend: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FROZEN_EXTENSION_FORBIDDEN');
  });

  it('engine also throws FROZEN_EXTENSION_FORBIDDEN when take-discard payload.extend=true on a frozen pile', () => {
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
      frozen: true,
      initialMeldDone: true,
      existingMeld: existing,
    });
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: [], extend: true },
      }),
    )).toBe('FROZEN_EXTENSION_FORBIDDEN');
  });

  it('validator result matches engine.applyAction outcome for every batch-1/2 error code', () => {
    // Sanity: any scenario where applyAction throws a CanastaPickupError
    // should also be flagged by canTakeDiscardPile with the SAME code.
    // This is the contract consumers rely on: pre-flight and run-time agree.
    const scenarios: Array<{
      name: string;
      setup: () => { state: GameState; pid: string; plan: { useCardIds?: string[]; extend?: boolean } };
      expectedCode: CanastaPickupErrorCode;
    }> = [
      {
        name: 'BLOCKED_BLACK_THREE',
        setup: () => {
          const { state, pid } = discardStateForTake(engine, {
            top: c('top','3','clubs'),
            handForPid: [c('k1','K','hearts'), c('k2','K','spades')],
          });
          return { state, pid, plan: {} };
        },
        expectedCode: 'BLOCKED_BLACK_THREE',
      },
      {
        name: 'BLOCKED_WILD_ON_TOP',
        setup: () => {
          const { state, pid } = discardStateForTake(engine, {
            top: c('top','2','clubs'),
            handForPid: [c('k1','K','hearts'), c('k2','K','spades')],
          });
          return { state, pid, plan: {} };
        },
        expectedCode: 'BLOCKED_WILD_ON_TOP',
      },
      {
        name: 'FROZEN_WILD_MATCH_FORBIDDEN',
        setup: () => {
          const { state, pid } = discardStateForTake(engine, {
            top: c('top','K','diamonds'),
            handForPid: [c('h1','K','hearts'), c('w','2','clubs')],
            frozen: true,
            initialMeldDone: false,
          });
          return { state, pid, plan: { useCardIds: ['h1','w'] } };
        },
        expectedCode: 'FROZEN_WILD_MATCH_FORBIDDEN',
      },
      {
        name: 'WILD_ONLY_MATCH_FORBIDDEN',
        setup: () => {
          const { state, pid } = discardStateForTake(engine, {
            top: c('top','K','diamonds'),
            handForPid: [
              c('h1','K','hearts'),
              c('w1','2','clubs'),
              c('w2','2','hearts'),
            ],
            frozen: false,
            initialMeldDone: true,
          });
          return { state, pid, plan: { useCardIds: ['w1','w2'] } };
        },
        expectedCode: 'WILD_ONLY_MATCH_FORBIDDEN',
      },
    ];

    for (const { name, setup, expectedCode } of scenarios) {
      const { state, pid, plan } = setup();
      const validatorResult = canTakeDiscardPile(state, pid, plan);
      expect(validatorResult.ok).toBe(false);
      if (!validatorResult.ok) {
        expect(validatorResult.code).toBe(expectedCode);
      }

      let engineCode: CanastaPickupErrorCode | undefined;
      try {
        engine.applyAction(state, pid, {
          type: 'take-discard',
          payload: plan,
        });
      } catch (err) {
        if (err instanceof CanastaPickupError) {
          engineCode = err.code;
        }
      }
      expect(engineCode).toBe(expectedCode);
      // Contract: validator and engine agreed on this scenario.
      void name;
    }
  });
});

// ===========================================================================
// Regression: handleMeld auto-merges same-rank duplicates + applyAction
// normalises any persisted duplicates on entry. Canasta allows at most one
// open meld per rank per side.
// ===========================================================================

describe('CanastaEngine — no duplicate same-rank melds', () => {
  const engine = new CanastaEngine();

  it('handleMeld: a new-meld group of the same rank merges into the existing meld (single meld emerges, 6 naturals)', () => {
    const existing: CanastaMeld = {
      rank: 'Q',
      cards: [c('e1','Q','hearts'), c('e2','Q','spades'), c('e3','Q','clubs')],
      naturals: 3,
      wilds: 0,
      isCanasta: false,
    };
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('h1','Q','diamonds'), c('h2','Q','hearts'), c('h3','Q','spades'),
      c('bye','5','hearts'),
    ];
    const state0 = forceMeldPhase(seedHand(start, pid, hand), pid);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      initialMeldDone: { A: true, B: false },
      melds: { A: [existing], B: [] },
    };
    const state: GameState = {
      ...state0,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    const after = engine.applyAction(state, pid, {
      type: 'meld',
      payload: { melds: [{ cardIds: ['h1','h2','h3'] }] },
    });
    const sideMelds = pd(after).melds.A!;
    expect(sideMelds).toHaveLength(1);
    expect(sideMelds[0]!.rank).toBe('Q');
    expect(sideMelds[0]!.naturals).toBe(6);
    expect(sideMelds[0]!.wilds).toBe(0);
  });

  it('handleMeld: two same-rank new-meld groups in ONE action merge into one meld', () => {
    // Side has no prior Q meld. Client (or bot) submits two groups of Qs
    // in a single action. Both are "new melds" by the client's frame, but
    // the engine must collapse them into a single 6-card meld.
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('a1','Q','hearts'), c('a2','Q','spades'), c('a3','Q','clubs'),
      c('b1','Q','diamonds'), c('b2','Q','hearts'), c('b3','Q','spades'),
      c('bye','5','hearts'),
    ];
    const state0 = forceMeldPhase(seedHand(start, pid, hand), pid);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      scoresPriorHand: { ...pd0.scoresPriorHand, A: -1 }, // threshold drops to 15
      initialMeldDone: { A: false, B: false },
      melds: { A: [], B: [] },
    };
    const state: GameState = {
      ...state0,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    const after = engine.applyAction(state, pid, {
      type: 'meld',
      payload: { melds: [
        { cardIds: ['a1','a2','a3'] },
        { cardIds: ['b1','b2','b3'] },
      ] },
    });
    const sideMelds = pd(after).melds.A!;
    expect(sideMelds).toHaveLength(1);
    expect(sideMelds[0]!.naturals).toBe(6);
    // Initial-meld threshold satisfied (60 points of Qs, threshold 15).
    expect(pd(after).initialMeldDone.A).toBe(true);
  });

  it('handleMeld: explicit extend on natural canasta with wild still blocks (guard applies to auto-merge too)', () => {
    const natural: CanastaMeld = {
      rank: 'Q',
      cards: [
        c('e1','Q','hearts'), c('e2','Q','spades'), c('e3','Q','clubs'),
        c('e4','Q','diamonds'), c('e5','Q','hearts'), c('e6','Q','spades'),
        c('e7','Q','clubs'),
      ],
      naturals: 7,
      wilds: 0,
      isCanasta: true,
      canastaType: 'natural',
    };
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('h1','Q','diamonds'), c('h2','Q','hearts'), c('w','2','clubs'),
    ];
    const state0 = forceMeldPhase(seedHand(start, pid, hand), pid);
    const pd0 = pd(state0);
    const cleaned: CanastaPublicData = {
      ...pd0,
      initialMeldDone: { A: true, B: false },
      melds: { A: [natural], B: [] },
    };
    const state: GameState = {
      ...state0,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    // Client omits `extend` — engine should STILL block the wild-on-
    // natural-canasta conversion via the auto-merge path.
    expect(() =>
      engine.applyAction(state, pid, {
        type: 'meld',
        payload: { melds: [{ cardIds: ['h1','h2','w'] }] },
      }),
    ).toThrow(/natural canasta/i);
  });

  it('applyAction normalises an input state that already holds two same-rank melds', () => {
    // Simulate a pre-fix persisted state: side A has TWO Q melds. The
    // normalisation pass in applyAction should collapse them to one
    // before any handler runs. We trigger the pass by calling a valid
    // action (draw), then inspect the melds on the resulting state.
    const dup1: CanastaMeld = {
      rank: 'Q',
      cards: [c('q1','Q','hearts'), c('q2','Q','spades'), c('q3','Q','clubs')],
      naturals: 3,
      wilds: 0,
      isCanasta: false,
    };
    const dup2: CanastaMeld = {
      rank: 'Q',
      cards: [c('q4','Q','diamonds'), c('q5','Q','hearts'), c('q6','Q','spades')],
      naturals: 3,
      wilds: 0,
      isCanasta: false,
    };
    const start = engine.startGame(makeConfig(4));
    const pid = start.currentTurn!;
    const pd0 = pd(start);
    const cleaned: CanastaPublicData = {
      ...pd0,
      initialMeldDone: { A: true, B: false },
      melds: { A: [dup1, dup2], B: [] },
    };
    const state: GameState = {
      ...start,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    const after = engine.applyAction(state, pid, { type: 'draw' });
    const sidePid = sideOfForTest(pd0.variant, start.players.map((p) => p.playerId), pid);
    void sidePid;
    // A-side always holds the Qs in this test setup.
    const sideMelds = pd(after).melds.A!;
    expect(sideMelds).toHaveLength(1);
    expect(sideMelds[0]!.naturals).toBe(6);
  });
});

// Tiny local helper so the test above doesn't need to reach into the engine's
// private sideOf (which isn't exported). Mirrors the 4p mapping used in tests.
function sideOfForTest(_variant: string | undefined, _playerIds: string[], playerId: string): string {
  return playerId;
}

// ===========================================================================
// Discard-pickup UX: auto-infer hand selection when useCardIds is empty.
// Clicking the discard pile / "Take Top" with nothing selected must Just Work
// in the common cases (extend an existing open meld; use two naturals).
// ===========================================================================

describe('CanastaEngine — take-discard auto-inference', () => {
  const engine = new CanastaEngine();

  it('empty useCardIds extends an existing open meld with just the top card', () => {
    const existing: CanastaMeld = {
      rank: 'K',
      cards: [c('e1','K','hearts'), c('e2','K','spades'), c('e3','K','clubs')],
      naturals: 3,
      wilds: 0,
      isCanasta: false,
    };
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [c('h1','9','hearts'), c('h2','8','spades')],
      frozen: false,
      initialMeldDone: true,
      existingMeld: existing,
    });
    const after = engine.applyAction(state, pid, { type: 'take-discard' });
    const meld = pd(after).melds.A![0]!;
    expect(meld.naturals).toBe(4);
    expect(pd(after).discardTop).toBeNull();
  });

  it('empty useCardIds auto-picks two naturals from hand when no existing meld', () => {
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [c('h1','K','hearts'), c('h2','K','spades'), c('h3','9','hearts')],
      frozen: false,
      initialMeldDone: true,
    });
    const after = engine.applyAction(state, pid, { type: 'take-discard' });
    const meld = pd(after).melds.A![0]!;
    expect(meld.rank).toBe('K');
    expect(meld.naturals).toBe(3);
    // Hand should be down by two naturals + up by zero pile cards (pile
    // was just the top).
    const player = after.players.find((p) => p.playerId === pid)!;
    expect(player.hand.map((c) => c.id)).toEqual(['h3']);
  });

  it('empty useCardIds still errors with NO_MATCHING_CARD when no matching naturals and no meld', () => {
    const { state, pid } = discardStateForTake(engine, {
      top: c('top','K','diamonds'),
      handForPid: [c('h1','9','hearts'), c('h2','8','spades')],
      frozen: false,
      initialMeldDone: true,
    });
    expect(expectPickupCode(() =>
      engine.applyAction(state, pid, { type: 'take-discard' }),
    )).toBe('NO_MATCHING_CARD');
  });
});

// ===========================================================================
// Batch 3 — rollback pattern verification.
// Engine is purely functional, so "rollback" is simply using the prior
// snapshot. This test documents the contract: the state object passed in
// to applyAction is never mutated, even on throw OR on success.
// ===========================================================================

describe('CanastaEngine — rollback via snapshot', () => {
  const engine = new CanastaEngine();

  it('applyAction never mutates the input state — callers can rollback by reusing the pre-call reference', () => {
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
    const snapshot = JSON.parse(JSON.stringify(state)) as GameState;
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: { useCardIds: [] },
    });
    // Post-action state differs.
    expect(after).not.toBe(state);
    // But the original reference is unchanged — its top card is still the
    // king from the pile, and the existing K meld still has 3 naturals
    // (the extension lives on `after.publicData.melds`, not state's).
    expect(JSON.stringify(state)).toBe(JSON.stringify(snapshot));
  });
});

// ===========================================================================
// Initial-meld threshold on discard pickup — 12 regression cases covering the
// Step 4 validator. The rule: sum card_point_value across every card in every
// meld being laid down (pickup meld + any additional melds), including wilds
// and the top card. Bonuses (red-3, canasta, going-out) do not contribute.
// Under a frozen pile, Step 3's "two naturals from hand" requirement for the
// pickup meld is independent of the threshold sum; wilds may still be added
// to a meld already anchored by those two naturals, and those wilds count
// toward the threshold.
// ===========================================================================

describe('CanastaEngine — initial-meld threshold on discard pickup', () => {
  const engine = new CanastaEngine();

  /**
   * Builds a state where side A has not yet made its initial meld and the
   * discard pile is a single top card. Seeds the player's hand exactly as
   * supplied (plus one leftover 4 by default, so the post-pickup hand is
   * never empty — the E19 undischargeable-hand guard would otherwise fire).
   */
  function buildThresholdScenario(opts: {
    top: Card;
    hand: Card[];
    buriedPile?: Card[];
    frozen?: boolean;
    priorScore?: number;
    existingMeldsA?: CanastaMeld[];
    flagMayUsePileCards?: boolean;
  }): { state: GameState; pid: string } {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    // Leftover guarantees handAfter.length > 0. Never referenced by plans.
    const leftover = c('leftover-4','4','hearts');
    const handWithLeftover = [...opts.hand, leftover];
    const state0 = seedHand(start, pid, handWithLeftover);
    const pd0 = pd(state0);
    const buried = opts.buriedPile ?? [];
    const topFaceUp = { ...opts.top, faceUp: true };
    const cleaned: CanastaPublicData = {
      ...pd0,
      discardPile: [...buried, topFaceUp],
      discardTop: topFaceUp,
      discardFrozen: !!opts.frozen,
      scoresPriorHand: { ...pd0.scoresPriorHand, A: opts.priorScore ?? 0 },
      initialMeldDone: { A: false, B: false },
      initialMeldDoneAtTurnStart: { A: false, B: false },
      melds: { A: opts.existingMeldsA ?? [], B: [] },
      flags: {
        ...pd0.flags,
        initialMeldMayUsePileCards: !!opts.flagMayUsePileCards,
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

  // --- 1. Threshold met by pickup meld with wilds (top K, K+K+Joker) -------
  it('1. accepts pickup meld whose wilds push it to threshold', () => {
    const { state, pid } = buildThresholdScenario({
      top: c('top','K','hearts'),
      hand: [c('k1','K','spades'), c('k2','K','clubs'), JOKER('j1')],
    });
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: { useCardIds: ['k1','k2','j1'] },
    });
    const meld = pd(after).melds.A![0]!;
    expect(meld.naturals).toBe(3);
    expect(meld.wilds).toBe(1);
    expect(pd(after).initialMeldDone.A).toBe(true);
  });

  // --- 2. Threshold met across multiple melds (pickup + second meld) -------
  it('2. accepts when sum across pickup meld + extra meld >= threshold', () => {
    const { state, pid } = buildThresholdScenario({
      top: c('top','5','hearts'),
      hand: [
        c('h5a','5','spades'), c('h5b','5','clubs'),
        c('hq1','Q','hearts'), c('hq2','Q','diamonds'),
        c('hq3','Q','clubs'),  c('hq4','Q','spades'),
      ],
    });
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: {
        useCardIds: ['h5a','h5b'],
        melds: [['hq1','hq2','hq3','hq4']],
      },
    });
    expect(pd(after).melds.A).toHaveLength(2);
    expect(pd(after).initialMeldDone.A).toBe(true);
  });

  // --- 3. Multi-meld with a wild in the non-pickup meld --------------------
  it('3. accepts when a wild in a non-pickup meld carries its full value', () => {
    const { state, pid } = buildThresholdScenario({
      top: c('top','4','hearts'),
      hand: [
        c('h4a','4','spades'), c('h4b','4','clubs'),
        c('h9a','9','hearts'), c('h9b','9','diamonds'), c('h9c','9','clubs'),
        c('w2s','2','spades'), // wild = 20 pts
      ],
    });
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: {
        useCardIds: ['h4a','h4b'],
        melds: [['h9a','h9b','h9c','w2s']],
      },
    });
    expect(pd(after).melds.A).toHaveLength(2);
    expect(pd(after).initialMeldDone.A).toBe(true);
  });

  // --- 4. Frozen pile, pickup meld includes a wild alongside 2 naturals ---
  it('4. accepts under frozen pile when 2-naturals anchor holds AND wilds count', () => {
    const { state, pid } = buildThresholdScenario({
      top: c('top','A','hearts'),
      hand: [
        c('ha1','A','spades'), c('ha2','A','clubs'),
        c('w2d','2','diamonds'), // wild
      ],
      frozen: true,
    });
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: { useCardIds: ['ha1','ha2','w2d'] },
    });
    const meld = pd(after).melds.A![0]!;
    expect(meld.naturals).toBe(3);
    expect(meld.wilds).toBe(1);
    expect(pd(after).initialMeldDone.A).toBe(true);
  });

  // --- 5. Threshold not met even with wilds and multi-meld ---------------
  it('5. rejects INITIAL_MELD_NOT_MET when sum across all melds falls short', () => {
    const { state, pid } = buildThresholdScenario({
      top: c('top','4','hearts'),
      hand: [
        c('h4a','4','spades'), c('h4b','4','clubs'),
        c('h6a','6','diamonds'), c('h6b','6','clubs'), c('h6c','6','spades'),
      ],
    });
    const code = expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: {
          useCardIds: ['h4a','h4b'],
          melds: [['h6a','h6b','h6c']],
        },
      }),
    );
    expect(code).toBe('INITIAL_MELD_NOT_MET');
  });

  // --- 6. Frozen, composition still enforced even if threshold would pass --
  it('6. rejects FROZEN_WILD_MATCH_FORBIDDEN before threshold (1 natural + 2 wilds)', () => {
    const { state, pid } = buildThresholdScenario({
      top: c('top','K','hearts'),
      hand: [
        c('k1','K','spades'),  // only 1 natural match
        JOKER('j1'), JOKER('j2'),
      ],
      frozen: true,
    });
    const code = expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: ['k1','j1','j2'] },
      }),
    );
    expect(code).toBe('FROZEN_WILD_MATCH_FORBIDDEN');
  });

  // --- 7. Unfrozen, one-natural + one-wild pickup meld (Step 3 method 2) --
  // SPEC DEVIATION: the bug spec specifies this test under "side has not yet
  // made its initial meld", but the engine enforces Hoyle's rule that a side
  // which has NOT yet melded must treat the pile as effectively frozen
  // (engine.ts:828 `effectivelyFrozen = discardFrozen || !initialMeldDone`).
  // Under that rule, 1-nat + 1-wild pickup is illegal pre-initial-meld
  // regardless of threshold — Step 3 method 2 only activates once the side
  // has melded. We verify the method-2 pickup in the regime where it IS
  // legal (post-initial-meld). The threshold summing behaviour is still
  // covered by tests 1–6 and 8–12.
  it('7. accepts unfrozen pickup via one-natural + one-wild (post-initial-meld)', () => {
    const { state: base, pid } = buildThresholdScenario({
      top: c('top','K','hearts'),
      hand: [c('k1','K','spades'), JOKER('j1')],
    });
    // Flip initial-meld-done so the effectively-frozen-until-meld rule lifts.
    const state: GameState = {
      ...base,
      publicData: {
        ...(base.publicData as Record<string, unknown>),
        initialMeldDone: { A: true, B: false },
        initialMeldDoneAtTurnStart: { A: true, B: false },
      } as Record<string, unknown>,
    };
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: { useCardIds: ['k1','j1'] },
    });
    const meld = pd(after).melds.A![0]!;
    expect(meld.naturals).toBe(2);
    expect(meld.wilds).toBe(1);
  });

  // --- 8. Red-three bonus on the board does not contribute to threshold ---
  it('8. rejects when only a red-3 bonus would lift the side to threshold', () => {
    const red3Meld: CanastaMeld = {
      rank: '3',
      cards: [c('r3h','3','hearts')],
      naturals: 0, // red 3s are a bonus marker, not a rank meld
      wilds: 0,
      isCanasta: false,
      redThrees: true,
    } as CanastaMeld;
    const { state, pid } = buildThresholdScenario({
      top: c('top','4','hearts'),
      hand: [c('h4a','4','spades'), c('h4b','4','clubs')],
      existingMeldsA: [red3Meld],
    });
    const code = expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: { useCardIds: ['h4a','h4b'] },
      }),
    );
    expect(code).toBe('INITIAL_MELD_NOT_MET');
  });

  // --- 9. Canasta bonus does not contribute to threshold ------------------
  it('9. rejects seven-7s meld (35 raw pts) even though it forms a canasta', () => {
    const { state, pid } = buildThresholdScenario({
      top: c('top','7','hearts'),
      hand: [
        c('h7a','7','spades'), c('h7b','7','clubs'), c('h7c','7','diamonds'),
        c('h7d','7','hearts'), c('h7e','7','spades'), c('h7f','7','clubs'),
      ],
    });
    const code = expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: {
          useCardIds: ['h7a','h7b','h7c','h7d','h7e','h7f'],
        },
      }),
    );
    expect(code).toBe('INITIAL_MELD_NOT_MET');
  });

  // --- 10. Boundary: exactly at threshold --------------------------------
  it('10. accepts when sum equals the threshold exactly', () => {
    const { state, pid } = buildThresholdScenario({
      top: c('top','5','hearts'),
      hand: [
        c('h5a','5','spades'), c('h5b','5','clubs'), c('h5c','5','diamonds'),
        c('h8a','8','diamonds'), c('h8b','8','hearts'), c('h8c','8','spades'),
      ],
    });
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: {
        useCardIds: ['h5a','h5b','h5c'],
        melds: [['h8a','h8b','h8c']],
      },
    });
    expect(pd(after).initialMeldDone.A).toBe(true);
    expect(pd(after).melds.A).toHaveLength(2);
  });

  // --- 11. A structurally-invalid meld in the plan halts the pickup ------
  it('11. rejects MELD_STRUCTURE_INVALID on illegal extra meld even if sum would pass', () => {
    const { state, pid } = buildThresholdScenario({
      top: c('top','K','hearts'),
      hand: [
        c('k1','K','spades'), c('k2','K','clubs'),
        c('w2d','2','diamonds'), c('w2h','2','hearts'), JOKER('j1'),
      ],
    });
    expect(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: {
          useCardIds: ['k1','k2'],
          // Three wilds, zero naturals — illegal new meld.
          melds: [['w2d','w2h','j1']],
        },
      }),
    ).toThrow(/meld/i);
    // And the side's initial meld must not flip to done on rejection.
    expect(pd(state).initialMeldDone.A).toBe(false);
  });

  // --- 12a. Flag OFF: buried pile cards are excluded from the sum --------
  it('12a. with initialMeldMayUsePileCards=false, buried cards do not count', () => {
    const { state, pid } = buildThresholdScenario({
      top: c('top','K','hearts'),
      // buried 9 under the top; player adds it to a hand-built 9-meld.
      buriedPile: [c('pc1','9','clubs')],
      hand: [
        c('k1','K','spades'), c('k2','K','clubs'),
        c('h9a','9','hearts'), c('h9b','9','diamonds'),
      ],
      priorScore: 1500, // threshold bumps to 90
      frozen: true,
      flagMayUsePileCards: false,
    });
    // Top K meld = 30. Extra meld [h9a,h9b,pc1]: without pc1 → 20 pts → 50 < 90.
    const code = expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'take-discard',
        payload: {
          useCardIds: ['k1','k2'],
          melds: [['h9a','h9b','pc1']],
        },
      }),
    );
    expect(code).toBe('INITIAL_MELD_NOT_MET');
  });

  // --- 12b. Flag ON: buried pile cards contribute to the sum -------------
  it('12b. with initialMeldMayUsePileCards=true, buried cards contribute', () => {
    // Same geometry, but now pile cards count. Top K meld = 30; extra 3x9
    // with pile card included = 30; total 60. Threshold 50 (default prior).
    const { state, pid } = buildThresholdScenario({
      top: c('top','K','hearts'),
      buriedPile: [c('pc1','9','clubs')],
      hand: [
        c('k1','K','spades'), c('k2','K','clubs'),
        c('h9a','9','hearts'), c('h9b','9','diamonds'),
      ],
      frozen: true,
      flagMayUsePileCards: true,
    });
    const after = engine.applyAction(state, pid, {
      type: 'take-discard',
      payload: {
        useCardIds: ['k1','k2'],
        melds: [['h9a','h9b','pc1']],
      },
    });
    expect(pd(after).initialMeldDone.A).toBe(true);
    expect(pd(after).melds.A).toHaveLength(2);
  });
});

// ===========================================================================
// Going-out via a black-3 exit meld. Hoyle: black 3s may only be melded on
// the going-out turn — the hand must reduce to exactly one card (the final
// discard) AND the side must already hold >= goOutRequirement canastas.
// The engine trusts the client's `goingOut` flag for the meld-composition
// check (validateNewMeld), but handleMeld itself enforces the post-condition
// so the board can never land in "black 3s melded but can't actually go out".
// ===========================================================================

describe('CanastaEngine — going-out post-conditions on handleMeld', () => {
  const engine = new CanastaEngine();

  /**
   * Seed a state where side A has already made its initial meld, has a
   * completed canasta on the board, and the player's hand contains exactly
   * three black 3s + one extra discardable card (a 5 by default).
   */
  function buildGoOutScenario(opts: {
    canastaCount?: number;      // how many canastas side A has on the board
    extraHandCards?: Card[];    // cards beyond the three black 3s
    goOutRequirement?: number;  // defaults to publicData value (1 for 4p)
  }): { state: GameState; pid: string } {
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const threeBlacks = [
      c('b1','3','clubs'),
      c('b2','3','spades'),
      c('b3','3','clubs'),
    ];
    const extra = opts.extraHandCards ?? [c('disc-5','5','hearts')];
    const state0 = seedHand(start, pid, [...threeBlacks, ...extra]);
    const pd0 = pd(state0);

    // Build `opts.canastaCount` natural canastas of 7s (5 pts each card).
    const canastas: CanastaMeld[] = [];
    for (let i = 0; i < (opts.canastaCount ?? 1); i++) {
      const suits: Array<Card['suit']> = ['hearts','diamonds','clubs','spades','hearts','diamonds','clubs'];
      const cards = suits.map((s, j) => c(`c${i}-7${j}`, '7', s));
      canastas.push({
        rank: '7',
        cards,
        naturals: 7,
        wilds: 0,
        isCanasta: true,
        canastaType: 'natural',
      } as CanastaMeld);
    }

    const cleaned: CanastaPublicData = {
      ...pd0,
      gamePhase: 'meld-discard',
      initialMeldDone: { A: true, B: false },
      initialMeldDoneAtTurnStart: { A: true, B: false },
      melds: { A: canastas, B: [] },
      goOutRequirement: opts.goOutRequirement ?? pd0.goOutRequirement,
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

  it('accepts 3 black 3s when hand will reduce to 1 AND side has enough canastas', () => {
    const { state, pid } = buildGoOutScenario({ canastaCount: 1 });
    const after = engine.applyAction(state, pid, {
      type: 'meld',
      payload: {
        melds: [{ cardIds: ['b1','b2','b3'], goingOut: true }],
      },
    });
    // Black-3 meld is on the board.
    const blackMeld = pd(after).melds.A!.find((m) => m.blackThrees);
    expect(blackMeld).toBeDefined();
    expect(blackMeld!.naturals).toBe(3);
    expect(blackMeld!.wilds).toBe(0);
    // Player's hand is the lone 5 (the discard that will end the turn).
    const player = after.players.find((p) => p.playerId === pid)!;
    expect(player.hand.map((c) => c.id)).toEqual(['disc-5']);
  });

  it('rejects black-3 meld when side has zero canastas even with goingOut:true', () => {
    const { state, pid } = buildGoOutScenario({ canastaCount: 0 });
    const code = expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'meld',
        payload: {
          melds: [{ cardIds: ['b1','b2','b3'], goingOut: true }],
        },
      }),
    );
    expect(code).toBe('CANNOT_GO_OUT');
  });

  it('rejects black-3 meld when hand would NOT reduce to 1 after the meld', () => {
    // Two extra non-meldable cards (can't both be discarded; hand post-meld = 2).
    const { state, pid } = buildGoOutScenario({
      canastaCount: 1,
      extraHandCards: [c('disc-5','5','hearts'), c('keep-6','6','diamonds')],
    });
    const code = expectPickupCode(() =>
      engine.applyAction(state, pid, {
        type: 'meld',
        payload: {
          melds: [{ cardIds: ['b1','b2','b3'], goingOut: true }],
        },
      }),
    );
    expect(code).toBe('CANNOT_GO_OUT');
  });

  it('rejects black-3 meld when goingOut flag is missing (existing rule)', () => {
    const { state, pid } = buildGoOutScenario({ canastaCount: 1 });
    expect(() =>
      engine.applyAction(state, pid, {
        type: 'meld',
        payload: {
          melds: [{ cardIds: ['b1','b2','b3'] }],
        },
      }),
    ).toThrow(/going out/i);
  });

  it('allows a NON-black-3 meld whose goingOut:true satisfies conditions (sanity)', () => {
    // Side A has 1 canasta, player holds three 9s + a discardable 4. Three 9s
    // is a legal going-out meld (naturals, no black-3 rule involved).
    const start = engine.startGame(makeConfig(4));
    const pid = 'p1';
    const hand = [
      c('n1','9','hearts'), c('n2','9','spades'), c('n3','9','clubs'),
      c('disc-4','4','hearts'),
    ];
    const state0 = seedHand(start, pid, hand);
    const pd0 = pd(state0);
    const canasta: CanastaMeld = {
      rank: '7',
      cards: ['hearts','diamonds','clubs','spades','hearts','diamonds','clubs'].map(
        (s, i) => c(`c0-7${i}`, '7', s as Card['suit']),
      ),
      naturals: 7, wilds: 0, isCanasta: true, canastaType: 'natural',
    } as CanastaMeld;
    const cleaned: CanastaPublicData = {
      ...pd0,
      gamePhase: 'meld-discard',
      initialMeldDone: { A: true, B: false },
      initialMeldDoneAtTurnStart: { A: true, B: false },
      melds: { A: [canasta], B: [] },
    };
    const state: GameState = {
      ...state0,
      currentTurn: pid,
      publicData: cleaned as unknown as Record<string, unknown>,
    };
    const after = engine.applyAction(state, pid, {
      type: 'meld',
      payload: {
        melds: [{ cardIds: ['n1','n2','n3'], goingOut: true }],
      },
    });
    expect(pd(after).melds.A!.some((m) => m.rank === '9')).toBe(true);
  });
});
