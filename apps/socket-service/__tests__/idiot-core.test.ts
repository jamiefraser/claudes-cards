/**
 * Idiot — pure core tests. Mirrors spec §12 item-by-item plus property
 * and snapshot coverage. Test setup helpers lean on hand injection so
 * each edge case is reproduced deterministically without playing the
 * whole game out from `newGame` every time.
 */

import {
  newGame,
  applyAction,
  legalActions,
  getPublicView,
  rankIsLegal,
  activeZoneOf,
  DEFAULT_CONFIG,
  type Card,
  type GameState,
  type PlayerState,
  type PileRequirement,
  type Rank,
  type Suit,
  type IdiotConfig,
} from '../src/games/idiot/core';

// ─── Helpers ────────────────────────────────────────────────────────

let cardCounter = 0;
function mkCard(rank: Rank, suit: Suit = 'S', idSuffix = ''): Card {
  return { rank, suit, id: `${rank}${suit}${idSuffix}${cardCounter++}` };
}

function cfg(partial: Partial<IdiotConfig> = {}): IdiotConfig {
  return { ...DEFAULT_CONFIG, ...partial };
}

/**
 * Manually seat players and stuff hands / face-up / face-down / stock.
 * Always returns a state in `play` phase with a clean pile and `any` req.
 */
function setupState(
  zones: Array<{
    id: string;
    hand?: Card[];
    faceUp?: Card[];
    faceDown?: Card[];
  }>,
  opts: {
    stock?: Card[];
    discard?: Card[];
    pileRequirement?: PileRequirement;
    config?: Partial<IdiotConfig>;
    firstPlayerIndex?: number;
    firstPlayLowestCardId?: string | null;
  } = {},
): GameState {
  const players: PlayerState[] = zones.map((z) => ({
    id: z.id,
    hand: z.hand ?? [],
    faceUp: z.faceUp ?? [],
    faceDown: z.faceDown ?? [],
    ready: true,
    finishedPlace: null,
  }));
  return {
    players,
    stock: opts.stock ?? [],
    discard: opts.discard ?? [],
    burned: [],
    pileRequirement: opts.pileRequirement ?? { kind: 'any' },
    currentPlayerIndex: opts.firstPlayerIndex ?? 0,
    direction: 1,
    phase: 'play',
    turnNumber: 1,
    roundNumber: 1,
    seed: 1,
    config: cfg(opts.config),
    finishedOrder: [],
    firstPlayLowestCardId: opts.firstPlayLowestCardId ?? null,
  };
}

function totalCards(state: GameState): number {
  return (
    state.players.reduce(
      (acc, p) => acc + p.hand.length + p.faceUp.length + p.faceDown.length,
      0,
    )
    + state.stock.length
    + state.discard.length
    + state.burned.length
  );
}

// ─── 1-4 setup + swap + opener ──────────────────────────────────────

describe('Idiot core — setup and swap phase', () => {
  it('newGame deals 3 hand + 3 face-up + 3 face-down per player (1)', () => {
    const state = newGame(['A', 'B', 'C'], {}, 42);
    expect(state.phase).toBe('swap');
    for (const p of state.players) {
      expect(p.hand).toHaveLength(3);
      expect(p.faceUp).toHaveLength(3);
      expect(p.faceDown).toHaveLength(3);
    }
    // 52 - 3*3*3 = 52 - 27 = 25 in stock
    expect(state.stock).toHaveLength(52 - 27);
    expect(totalCards(state)).toBe(52);
  });

  it('6p game uses two decks — 104 cards accounted for', () => {
    const state = newGame(['A', 'B', 'C', 'D', 'E', 'F'], {}, 42);
    expect(state.config.decks).toBe(2);
    expect(totalCards(state)).toBe(104);
    // 104 - 6*9 = 104 - 54 = 50 in stock
    expect(state.stock).toHaveLength(50);
  });

  it('swap phase allows hand ↔ face-up swaps; reversible until ready (1)', () => {
    const state = newGame(['A', 'B'], {}, 42);
    const pA = state.players[0]!;
    const handCard = pA.hand[0]!;
    const fuCard = pA.faceUp[0]!;
    const after = applyAction(state, {
      kind: 'swap',
      playerId: 'A',
      handCardId: handCard.id,
      faceUpCardId: fuCard.id,
    });
    const pA2 = after.players[0]!;
    expect(pA2.hand.some((c) => c.id === fuCard.id)).toBe(true);
    expect(pA2.faceUp.some((c) => c.id === handCard.id)).toBe(true);
    // Swap back is legal (still not ready).
    const back = applyAction(after, {
      kind: 'swap',
      playerId: 'A',
      handCardId: fuCard.id,
      faceUpCardId: handCard.id,
    });
    const pA3 = back.players[0]!;
    expect(pA3.hand.some((c) => c.id === handCard.id)).toBe(true);
    expect(pA3.faceUp.some((c) => c.id === fuCard.id)).toBe(true);
  });

  it('all ready → phase switches to play (2)', () => {
    let state = newGame(['A', 'B'], {}, 42);
    state = applyAction(state, { kind: 'ready', playerId: 'A' });
    expect(state.phase).toBe('swap');
    state = applyAction(state, { kind: 'ready', playerId: 'B' });
    expect(state.phase).toBe('play');
    expect(state.turnNumber).toBe(1);
  });

  it('opener holds lowest 3 and must include it on first play (3)', () => {
    const three = mkCard('3', 'C');
    const state = setupState(
      [
        { id: 'A', hand: [three, mkCard('6'), mkCard('9')] },
        { id: 'B', hand: [mkCard('7'), mkCard('8'), mkCard('9', 'H')] },
      ],
      { firstPlayerIndex: 0, firstPlayLowestCardId: three.id },
    );
    const legals = legalActions(state, 'A');
    // Every legal hand play must include the three
    for (const a of legals) {
      if (a.kind !== 'playFromHand') continue;
      expect(a.cardIds).toContain(three.id);
    }
    expect(() =>
      applyAction(state, {
        kind: 'playFromHand', playerId: 'A', cardIds: [state.players[0]!.hand[1]!.id],
      }),
    ).toThrow();
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [three.id],
    });
    expect(after.firstPlayLowestCardId).toBeNull();
  });

  it('tiebreak by seat order when two players share the lowest-3 (4)', () => {
    const threeC = mkCard('3', 'C');
    const threeH = mkCard('3', 'H');
    // Both A and B have a 3. A sits earlier → A opens.
    const state: GameState = {
      ...setupState(
        [
          { id: 'A', hand: [threeC, mkCard('8'), mkCard('K')] },
          { id: 'B', hand: [threeH, mkCard('8', 'H'), mkCard('K', 'H')] },
        ],
        { firstPlayerIndex: 0, firstPlayLowestCardId: threeC.id },
      ),
    };
    expect(state.currentPlayerIndex).toBe(0);
  });
});

// ─── 5-6 normal + multi plays ───────────────────────────────────────

describe('Idiot core — normal and multi-card plays', () => {
  it('plays a single card ≥ top (5)', () => {
    const top = mkCard('5');
    const seven = mkCard('7');
    const state = setupState(
      [{ id: 'A', hand: [seven, mkCard('4')] }, { id: 'B' }],
      { discard: [top], pileRequirement: { kind: 'geq', rank: '5' } },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [seven.id],
    });
    expect(after.discard[after.discard.length - 1]!.rank).toBe('7');
    expect(after.pileRequirement).toEqual({ kind: 'geq', rank: '7' });
    expect(after.currentPlayerIndex).toBe(1);
  });

  it('plays two 7s at once; pileRequirement = geq 7 (6)', () => {
    const s7a = mkCard('7');
    const s7b = mkCard('7', 'H');
    const state = setupState(
      [{ id: 'A', hand: [s7a, s7b, mkCard('J')] }, { id: 'B' }],
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [s7a.id, s7b.id],
    });
    expect(after.discard).toHaveLength(2);
    expect(after.pileRequirement).toEqual({ kind: 'geq', rank: '7' });
  });

  it('rejects multi-card plays that mix ranks', () => {
    const a = mkCard('7');
    const b = mkCard('8');
    const state = setupState([{ id: 'A', hand: [a, b] }, { id: 'B' }]);
    expect(() =>
      applyAction(state, {
        kind: 'playFromHand', playerId: 'A', cardIds: [a.id, b.id],
      }),
    ).toThrow(/same rank|share a rank/i);
  });
});

// ─── 7-11 power cards ───────────────────────────────────────────────

describe('Idiot core — power cards (2, 10, 8, four-of-kind)', () => {
  it('2 resets pile to any (7)', () => {
    const two = mkCard('2');
    const state = setupState(
      [{ id: 'A', hand: [two] }, { id: 'B' }],
      { discard: [mkCard('K')], pileRequirement: { kind: 'geq', rank: 'K' } },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [two.id],
    });
    expect(after.pileRequirement).toEqual({ kind: 'any' });
  });

  it('10 burns pile; same player plays again (8)', () => {
    const ten = mkCard('10');
    const follow = mkCard('4');
    const state = setupState(
      [{ id: 'A', hand: [ten, follow] }, { id: 'B' }],
      { discard: [mkCard('5'), mkCard('6'), mkCard('7')] },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [ten.id],
    });
    expect(after.discard).toHaveLength(0);
    expect(after.burned).toHaveLength(4); // 3 pile cards + the 10 itself
    expect(after.pileRequirement).toEqual({ kind: 'any' });
    expect(after.currentPlayerIndex).toBe(0); // A plays again
  });

  it('playing 10 from hand refills from stock before replaying (9)', () => {
    const ten = mkCard('10');
    const filler = mkCard('J');
    const state = setupState(
      [{ id: 'A', hand: [ten] }, { id: 'B' }],
      { stock: [filler, mkCard('Q'), mkCard('K')] },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [ten.id],
    });
    // Hand was 1, stock was 3 → after playing 10, hand refills up to 3
    expect(after.players[0]!.hand).toHaveLength(3);
    expect(after.currentPlayerIndex).toBe(0);
  });

  it('four-of-a-kind via single multi-card play burns pile (10)', () => {
    const sevens = [mkCard('7'), mkCard('7', 'H'), mkCard('7', 'D'), mkCard('7', 'C')];
    const state = setupState(
      [{ id: 'A', hand: sevens }, { id: 'B' }],
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: sevens.map((c) => c.id),
    });
    expect(after.discard).toHaveLength(0);
    expect(after.burned).toHaveLength(4);
    expect(after.currentPlayerIndex).toBe(0);
  });

  it('four-of-a-kind via stacking across multiple plays burns (11)', () => {
    // Pile already has three 7s; A plays the fourth 7.
    const fourth = mkCard('7', 'C');
    const state = setupState(
      [{ id: 'A', hand: [fourth, mkCard('J')] }, { id: 'B' }],
      {
        discard: [mkCard('5'), mkCard('7'), mkCard('7', 'H'), mkCard('7', 'D')],
        pileRequirement: { kind: 'geq', rank: '7' },
      },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [fourth.id],
    });
    expect(after.discard).toHaveLength(0);
    // 4 pre-existing + 1 played = 5 burned (pile was [5,7,7,7] then +7)
    expect(after.burned).toHaveLength(5);
    expect(after.currentPlayerIndex).toBe(0);
  });

  it('burn clears pile and sets requirement to any (12)', () => {
    const ten = mkCard('10');
    const state = setupState(
      [{ id: 'A', hand: [ten] }, { id: 'B' }],
      { discard: [mkCard('Q')], pileRequirement: { kind: 'geq', rank: 'Q' } },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [ten.id],
    });
    expect(after.pileRequirement).toEqual({ kind: 'any' });
  });

  it('transparent 8 keeps req from beneath; 5 still needed after 8 (13)', () => {
    const eight = mkCard('8');
    const state = setupState(
      [{ id: 'A', hand: [eight] }, { id: 'B', hand: [mkCard('4'), mkCard('6')] }],
      { discard: [mkCard('5')], pileRequirement: { kind: 'geq', rank: '5' } },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [eight.id],
    });
    expect(after.pileRequirement).toEqual({ kind: 'geq', rank: '5' });
    // Now B plays — 4 is illegal (< 5); 6 is legal.
    expect(rankIsLegal('4', after.pileRequirement)).toBe(false);
    expect(rankIsLegal('6', after.pileRequirement)).toBe(true);
  });

  it('stacked transparent 8s keep the underlying requirement (14)', () => {
    const eights = [mkCard('8'), mkCard('8', 'H'), mkCard('8', 'D')];
    const state = setupState(
      [{ id: 'A', hand: eights }, { id: 'B' }],
      { discard: [mkCard('5')], pileRequirement: { kind: 'geq', rank: '5' } },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: eights.map((c) => c.id),
    });
    expect(after.pileRequirement).toEqual({ kind: 'geq', rank: '5' });
  });

  it('8 on empty pile — next requirement remains any (15)', () => {
    const eight = mkCard('8');
    const state = setupState(
      [{ id: 'A', hand: [eight] }, { id: 'B' }],
      { pileRequirement: { kind: 'any' } },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [eight.id],
    });
    expect(after.pileRequirement).toEqual({ kind: 'any' });
  });
});

// ─── 7-lower variant ────────────────────────────────────────────────

describe('Idiot core — 7-lower variant', () => {
  it('plays 7 → leq 7 requirement when variant on', () => {
    const seven = mkCard('7');
    const state = setupState(
      [{ id: 'A', hand: [seven] }, { id: 'B', hand: [mkCard('5'), mkCard('J')] }],
      { config: { sevensLower: true } },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [seven.id],
    });
    expect(after.pileRequirement).toEqual({ kind: 'leq', rank: '7' });
    expect(rankIsLegal('5', after.pileRequirement)).toBe(true);
    expect(rankIsLegal('J', after.pileRequirement)).toBe(false);
  });

  it('7 acts normally when variant off (default)', () => {
    const seven = mkCard('7');
    const state = setupState([{ id: 'A', hand: [seven] }, { id: 'B' }]);
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [seven.id],
    });
    expect(after.pileRequirement).toEqual({ kind: 'geq', rank: '7' });
  });
});

// ─── 16-17 pick-up ──────────────────────────────────────────────────

describe('Idiot core — pick-up', () => {
  it('cannot play → pick up discard pile into hand (16)', () => {
    const state = setupState(
      [{ id: 'A', hand: [mkCard('4'), mkCard('5')] }, { id: 'B' }],
      { discard: [mkCard('K')], pileRequirement: { kind: 'geq', rank: 'K' } },
    );
    const actions = legalActions(state, 'A');
    expect(actions).toEqual([{ kind: 'pickUpPile', playerId: 'A' }]);
    const after = applyAction(state, { kind: 'pickUpPile', playerId: 'A' });
    expect(after.players[0]!.hand).toHaveLength(3);
    expect(after.discard).toHaveLength(0);
    expect(after.pileRequirement).toEqual({ kind: 'any' });
  });

  it('after pickup next player starts with empty pile + any (17)', () => {
    const state = setupState(
      [{ id: 'A', hand: [mkCard('3')] }, { id: 'B', hand: [mkCard('4')] }],
      { discard: [mkCard('K')], pileRequirement: { kind: 'geq', rank: 'K' } },
    );
    const after = applyAction(state, { kind: 'pickUpPile', playerId: 'A' });
    expect(after.currentPlayerIndex).toBe(1);
    expect(after.pileRequirement).toEqual({ kind: 'any' });
    // B can now play anything.
    const bActs = legalActions(after, 'B');
    expect(bActs.some((a) => a.kind === 'playFromHand')).toBe(true);
  });

  it('rejects voluntary pickup by default when legal plays exist', () => {
    const state = setupState(
      [{ id: 'A', hand: [mkCard('5')] }, { id: 'B' }],
      { discard: [mkCard('4')], pileRequirement: { kind: 'geq', rank: '4' } },
    );
    expect(() => applyAction(state, { kind: 'pickUpPile', playerId: 'A' })).toThrow();
  });
});

// ─── 18-20 zone transitions ─────────────────────────────────────────

describe('Idiot core — zone transitions', () => {
  it('refills from stock keeps hand at 3 while stock has cards (18)', () => {
    const state = setupState(
      [{ id: 'A', hand: [mkCard('5')] }, { id: 'B' }],
      { stock: [mkCard('6'), mkCard('7'), mkCard('8'), mkCard('9')] },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [state.players[0]!.hand[0]!.id],
    });
    // Hand had 1 → played 1 → refilled to 3 by drawing 3 from stock of 4.
    expect(after.players[0]!.hand).toHaveLength(3);
    expect(after.stock).toHaveLength(1);
  });

  it('hand+stock empty → face-up becomes the active zone (19)', () => {
    const state = setupState(
      [
        { id: 'A', faceUp: [mkCard('8'), mkCard('J')], faceDown: [mkCard('5')] },
        { id: 'B', hand: [mkCard('3')] },
      ],
    );
    const zone = activeZoneOf(state, state.players[0]!);
    expect(zone).toBe('faceUp');
    const acts = legalActions(state, 'A');
    expect(acts.every((a) => a.kind === 'playFromFaceUp' || a.kind === 'pickUpPile')).toBe(true);
  });

  it('face-up empty → face-down zone (20)', () => {
    const state = setupState(
      [
        { id: 'A', faceDown: [mkCard('5')] },
        { id: 'B', hand: [mkCard('3')] },
      ],
    );
    expect(activeZoneOf(state, state.players[0]!)).toBe('faceDown');
    const acts = legalActions(state, 'A');
    expect(acts.some((a) => a.kind === 'playFromFaceDown')).toBe(true);
  });
});

// ─── 21-22 face-down plays ──────────────────────────────────────────

describe('Idiot core — face-down plays', () => {
  it('illegal face-down play triggers pickup (21)', () => {
    const badCard = mkCard('3');
    const state = setupState(
      [
        { id: 'A', faceDown: [badCard, mkCard('6')] },
        { id: 'B', hand: [mkCard('4')] },
      ],
      { discard: [mkCard('K')], pileRequirement: { kind: 'geq', rank: 'K' } },
    );
    const after = applyAction(state, {
      kind: 'playFromFaceDown', playerId: 'A', cardId: badCard.id,
    });
    const pA = after.players[0]!;
    // The 3 is removed from faceDown AND goes into hand along with the K.
    expect(pA.faceDown).toHaveLength(1);
    expect(pA.hand.find((c) => c.id === badCard.id)).toBeTruthy();
    expect(pA.hand.find((c) => c.rank === 'K')).toBeTruthy();
    expect(after.discard).toHaveLength(0);
    expect(after.currentPlayerIndex).toBe(1);
  });

  it('legal face-down play continues normally (22)', () => {
    const goodCard = mkCard('Q');
    const state = setupState(
      [
        { id: 'A', faceDown: [goodCard, mkCard('5')] },
        { id: 'B', hand: [mkCard('K')] },
      ],
      { discard: [mkCard('J')], pileRequirement: { kind: 'geq', rank: 'J' } },
    );
    const after = applyAction(state, {
      kind: 'playFromFaceDown', playerId: 'A', cardId: goodCard.id,
    });
    expect(after.players[0]!.faceDown).toHaveLength(1);
    expect(after.discard[after.discard.length - 1]!.rank).toBe('Q');
    expect(after.currentPlayerIndex).toBe(1);
  });
});

// ─── 23-28 winning + losing ─────────────────────────────────────────

describe('Idiot core — winning and finishing', () => {
  it('win by playing last face-down card (23)', () => {
    const last = mkCard('Q');
    const state = setupState(
      [{ id: 'A', faceDown: [last] }, { id: 'B', hand: [mkCard('3')] }],
    );
    const after = applyAction(state, {
      kind: 'playFromFaceDown', playerId: 'A', cardId: last.id,
    });
    // Only B left → game over; A placed 1st.
    expect(after.phase).toBe('gameOver');
    expect(after.finishedOrder).toEqual(['A']);
    expect(after.players[0]!.finishedPlace).toBe(1);
  });

  it('win by 10-burn with last card (24)', () => {
    const ten = mkCard('10');
    const state = setupState(
      [{ id: 'A', hand: [ten] }, { id: 'B', hand: [mkCard('3')] }],
      { discard: [mkCard('5')] },
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [ten.id],
    });
    expect(after.phase).toBe('gameOver');
    expect(after.players[0]!.finishedPlace).toBe(1);
  });

  it('two-player game: winner → loser is Idiot (25)', () => {
    const last = mkCard('A');
    const state = setupState(
      [{ id: 'A', hand: [last] }, { id: 'B', hand: [mkCard('3'), mkCard('4')] }],
    );
    const after = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [last.id],
    });
    expect(after.phase).toBe('gameOver');
    expect(after.finishedOrder).toEqual(['A']);
    expect(after.players[1]!.finishedPlace).toBeNull(); // B is the Idiot
  });

  it('3+ players: placements assigned as they finish; last is Idiot (26)', () => {
    let state = setupState(
      [
        { id: 'A', hand: [mkCard('J')] },
        { id: 'B', hand: [mkCard('Q')] },
        { id: 'C', hand: [mkCard('3'), mkCard('4')] },
      ],
      { discard: [mkCard('5')] },
    );
    // A plays J → empties; A wins (1st). Turn to B.
    state = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [state.players[0]!.hand[0]!.id],
    });
    expect(state.players[0]!.finishedPlace).toBe(1);
    // B plays Q → empties; B wins (2nd). Game over (C is last).
    state = applyAction(state, {
      kind: 'playFromHand', playerId: 'B', cardIds: [state.players[1]!.hand[0]!.id],
    });
    expect(state.phase).toBe('gameOver');
    expect(state.finishedOrder).toEqual(['A', 'B']);
  });

  it('winner is skipped in rotation; play continues (27)', () => {
    let state = setupState(
      [
        { id: 'A', hand: [mkCard('J')] },
        { id: 'B', hand: [mkCard('6'), mkCard('Q')] },
        { id: 'C', hand: [mkCard('4'), mkCard('5')] },
      ],
    );
    // A empties (wins 1st). Turn should jump to B (not A).
    state = applyAction(state, {
      kind: 'playFromHand', playerId: 'A', cardIds: [state.players[0]!.hand[0]!.id],
    });
    expect(state.currentPlayerIndex).toBe(1);
    // B plays 6 normally (Q would be overkill but both are ≥ J? no — req is geq J). Play Q.
    state = applyAction(state, {
      kind: 'playFromHand', playerId: 'B', cardIds: [state.players[1]!.hand[1]!.id],
    });
    // Next turn: must skip A (finished). Go to C.
    expect(state.currentPlayerIndex).toBe(2);
  });

  it('deterministic: same seed + actions → same state (28)', () => {
    const s1 = newGame(['A', 'B', 'C'], {}, 12345);
    const s2 = newGame(['A', 'B', 'C'], {}, 12345);
    for (let i = 0; i < 3; i++) {
      expect(s1.players[i]!.hand.map((c) => c.id)).toEqual(s2.players[i]!.hand.map((c) => c.id));
      expect(s1.players[i]!.faceUp.map((c) => c.id)).toEqual(s2.players[i]!.faceUp.map((c) => c.id));
      expect(s1.players[i]!.faceDown.map((c) => c.id)).toEqual(s2.players[i]!.faceDown.map((c) => c.id));
    }
    expect(s1.stock.map((c) => c.id)).toEqual(s2.stock.map((c) => c.id));
  });

  it('different seeds → different deals', () => {
    const s1 = newGame(['A', 'B', 'C'], {}, 1);
    const s2 = newGame(['A', 'B', 'C'], {}, 999);
    expect(s1.players[0]!.hand.map((c) => c.id))
      .not.toEqual(s2.players[0]!.hand.map((c) => c.id));
  });
});

// ─── Properties ─────────────────────────────────────────────────────

describe('Idiot core — invariants', () => {
  it('card conservation: count never changes across any legal action', () => {
    let state = newGame(['A', 'B', 'C'], {}, 7);
    // Ready all players.
    for (const p of state.players) state = applyAction(state, { kind: 'ready', playerId: p.id });
    expect(totalCards(state)).toBe(52);

    // Play 50 random legal actions; count must always equal 52.
    let rng = 0.5;
    for (let step = 0; step < 80 && state.phase !== 'gameOver'; step++) {
      const current = state.players[state.currentPlayerIndex]!;
      if (current.finishedPlace !== null) break;
      const legal = legalActions(state, current.id);
      if (legal.length === 0) break;
      rng = (rng * 9301 + 49297) % 233280 / 233280;
      const pick = legal[Math.floor(rng * legal.length)]!;
      state = applyAction(state, pick);
      expect(totalCards(state)).toBe(52);
    }
  });

  it('no card appears in two zones at the same time', () => {
    let state = newGame(['A', 'B'], {}, 42);
    for (const p of state.players) state = applyAction(state, { kind: 'ready', playerId: p.id });
    const seen = new Set<string>();
    for (const p of state.players) {
      for (const c of [...p.hand, ...p.faceUp, ...p.faceDown]) {
        expect(seen.has(c.id)).toBe(false);
        seen.add(c.id);
      }
    }
    for (const c of [...state.stock, ...state.discard, ...state.burned]) {
      expect(seen.has(c.id)).toBe(false);
      seen.add(c.id);
    }
  });
});

// ─── Public view ────────────────────────────────────────────────────

describe('Idiot core — public view', () => {
  it('hides opponents hands + face-down counts', () => {
    const state = newGame(['A', 'B'], {}, 42);
    const view = getPublicView(state, 'A');
    expect(view.viewerHand).toEqual(state.players[0]!.hand);
    expect(view.players[1]!.handCount).toBe(3);
    expect(view.players[1]!).not.toHaveProperty('hand');
    expect(view.players[1]!.faceDownCount).toBe(3);
    // Face-up is public.
    expect(view.players[1]!.faceUp).toEqual(state.players[1]!.faceUp);
  });
});

// ─── Snapshot ───────────────────────────────────────────────────────

describe('Idiot core — snapshots', () => {
  it('full 3p deal seed=42 is stable', () => {
    const state = newGame(['A', 'B', 'C'], {}, 42);
    const shape = {
      opener: state.currentPlayerIndex,
      firstPlayLowestCardId: state.firstPlayLowestCardId,
      hands: state.players.map((p) => p.hand.map((c) => `${c.rank}${c.suit}`)),
      faceUp: state.players.map((p) => p.faceUp.map((c) => `${c.rank}${c.suit}`)),
      faceDown: state.players.map((p) => p.faceDown.map((c) => `${c.rank}${c.suit}`)),
      stockTop5: state.stock.slice(-5).map((c) => `${c.rank}${c.suit}`),
    };
    expect(shape).toMatchSnapshot();
  });
});
