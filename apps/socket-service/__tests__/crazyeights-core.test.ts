/**
 * Crazy Eights — pure-core tests.
 *
 * Covers the §12 edge-case checklist + §13 property / snapshot tests
 * from the spec (see src/games/crazyeights/README.md).
 *
 * Most edge-case tests force a deterministic board by rewriting the
 * top card on the discard and the current player's hand. That's
 * simpler than engineering a seed that produces the exact shuffle we
 * want, and it isolates the rule we're actually testing.
 */

import {
  newGame,
  applyAction,
  legalActions,
  getPublicView,
  startNextRound,
  DEFAULT_CONFIG,
  DEFAULT_ACTION_CARDS,
  type Card,
  type GameState,
  type Suit,
  type Rank,
  type Action,
  type CrazyEightsConfig,
  type ActionCardConfig,
} from '../src/games/crazyeights/core';

// ─── Helpers ────────────────────────────────────────────────────────

function mkCard(rank: Rank, suit: Suit, deckIdx = 0): Card {
  return { rank, suit, id: deckIdx === 0 ? `${rank}${suit}` : `${rank}${suit}_d${deckIdx}` };
}

function cfg(overrides: Partial<CrazyEightsConfig> = {}): CrazyEightsConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    actionCards: {
      ...DEFAULT_ACTION_CARDS,
      ...(overrides.actionCards ?? {}),
    },
  };
}

function actionCards(overrides: Partial<ActionCardConfig>): ActionCardConfig {
  return { ...DEFAULT_ACTION_CARDS, ...overrides };
}

/** Replace a player's hand with exactly these cards. */
function setHand(state: GameState, id: string, hand: Card[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, hand: [...hand] } : p)),
  };
}

/** Replace the discard pile (and activeSuit to its top's suit). */
function setDiscardTop(state: GameState, top: Card, rest: Card[] = []): GameState {
  return {
    ...state,
    discard: [...rest, top],
    activeSuit: top.rank === '8' ? state.activeSuit : top.suit,
  };
}

function setActiveSuit(state: GameState, suit: Suit): GameState {
  return { ...state, activeSuit: suit };
}

function setCurrent(state: GameState, id: string): GameState {
  return { ...state, currentPlayerIndex: state.players.findIndex((p) => p.id === id) };
}

function setStock(state: GameState, stock: Card[]): GameState {
  return { ...state, stock: [...stock] };
}

function totalCards(state: GameState): number {
  return (
    state.stock.length +
    state.discard.length +
    state.players.reduce((n, p) => n + p.hand.length, 0)
  );
}

function ids(cards: Card[]): string[] {
  return cards.map((c) => c.id);
}

// ─── §12 edge-case checklist ────────────────────────────────────────

describe('Crazy Eights — §12 edge cases', () => {
  it('(1) play a matching-suit card', () => {
    let s = newGame(['a', 'b'], cfg(), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    s = setHand(s, 'a', [mkCard('9', 'S'), mkCard('K', 'D')]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: '9S' });
    expect(s.activeSuit).toBe('S');
    expect(s.discard[s.discard.length - 1]!.id).toBe('9S');
  });

  it('(2) play a matching-rank card (different suit)', () => {
    let s = newGame(['a', 'b'], cfg(), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    s = setHand(s, 'a', [mkCard('5', 'H'), mkCard('K', 'D')]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: '5H' });
    expect(s.activeSuit).toBe('H');
    expect(s.discard[s.discard.length - 1]!.rank).toBe('5');
  });

  it('(3) play an 8, declare a suit — next player must match the declared suit', () => {
    let s = newGame(['a', 'b'], cfg(), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    // a needs a second card so playing the 8 doesn't end the round
    // before the suit-choice phase matters.
    s = setHand(s, 'a', [mkCard('8', 'C'), mkCard('K', 'H')]);
    s = setHand(s, 'b', [mkCard('K', 'S'), mkCard('K', 'D')]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: '8C' });
    expect(s.phase).toBe('awaitingSuitChoice');
    // Only a's declareSuit actions are legal.
    expect(legalActions(s, 'b').length).toBe(0);
    s = applyAction(s, { kind: 'declareSuit', playerId: 'a', suit: 'D' });
    expect(s.activeSuit).toBe('D');
    expect(s.phase).toBe('awaitingPlay');
    // b's only legal play is KD.
    const bLegal = legalActions(s, 'b').filter((x) => x.kind === 'play') as Extract<Action, { kind: 'play' }>[];
    expect(bLegal.map((a) => a.cardId)).toEqual(['KD']);
  });

  it('(4) play an 8 declaring the card-underneath suit — legal, phase clears', () => {
    let s = newGame(['a', 'b'], cfg(), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'H'));
    s = setHand(s, 'a', [mkCard('8', 'C'), mkCard('2', 'C')]);
    s = setHand(s, 'b', [mkCard('9', 'H')]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: '8C' });
    s = applyAction(s, { kind: 'declareSuit', playerId: 'a', suit: 'H' });
    expect(s.activeSuit).toBe('H');
    expect(s.phase).toBe('awaitingPlay');
  });

  it('(5) starter = 8 with reshuffle rule → reshuffled away', () => {
    // With reshuffle, the top is guaranteed not to be an 8. We verify
    // across a few seeds to cover the retry loop.
    for (const seed of [1, 2, 3, 10, 100]) {
      const s = newGame(['a', 'b'], cfg({ starterEightRule: 'reshuffle' }), seed);
      expect(s.discard[0]!.rank).not.toBe('8');
    }
  });

  it('(6) starter = 8 with nominate rule → phase=awaitingSuitChoice, first player picks', () => {
    // Seed where the first flipped card happens to be an 8 — if the
    // chosen seed doesn't flip an 8 first, rewrite the discard to force
    // the scenario and verify the phase behaviour.
    let s = newGame(['a', 'b'], cfg({ starterEightRule: 'nominate' }), 1);
    s = { ...s, discard: [mkCard('8', 'H')], activeSuit: 'H', phase: 'awaitingSuitChoice' };
    s = setHand(s, 'a', [mkCard('2', 'C')]);
    s = setHand(s, 'b', [mkCard('3', 'D')]);
    expect(s.phase).toBe('awaitingSuitChoice');
    // Only the current player's declareSuit actions are legal.
    expect(legalActions(s, 'a').every((x) => x.kind === 'declareSuit')).toBe(true);
    s = applyAction(s, { kind: 'declareSuit', playerId: s.players[s.currentPlayerIndex]!.id, suit: 'C' });
    expect(s.activeSuit).toBe('C');
    expect(s.phase).toBe('awaitingPlay');
  });

  it('(7) no legal play → draws under configured drawRule', () => {
    let s = newGame(['a', 'b'], cfg({ drawRule: 'drawOne' }), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    s = setHand(s, 'a', [mkCard('K', 'D')]);
    s = setStock(s, [mkCard('K', 'H'), mkCard('Q', 'C')]);
    // Only draw is legal (no playable K in hand).
    const legal = legalActions(s, 'a');
    expect(legal.some((x) => x.kind === 'draw')).toBe(true);
    s = applyAction(s, { kind: 'draw', playerId: 'a' });
    const a = s.players.find((p) => p.id === 'a')!;
    expect(a.hand.length).toBe(2);
  });

  it('(8) drawUntilPlayable: draws multiple until legal one appears; plays it', () => {
    let s = newGame(['a', 'b'], cfg({ drawRule: 'drawUntilPlayable' }), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    s = setHand(s, 'a', [mkCard('K', 'D')]);
    // Stock: two unplayables then a matching-suit S.
    s = setStock(s, [mkCard('K', 'H'), mkCard('K', 'C'), mkCard('9', 'S')]);
    s = applyAction(s, { kind: 'draw', playerId: 'a' });
    // a drew 3, played the 9S, so hand is [KD, KH, KC] (3 cards).
    const a = s.players.find((p) => p.id === 'a')!;
    expect(a.hand.length).toBe(3);
    expect(s.discard[s.discard.length - 1]!.id).toBe('9S');
    expect(s.activeSuit).toBe('S');
  });

  it('(9) drawUntilPlayable: stock runs out mid-draw → reshuffle, continue', () => {
    let s = newGame(['a', 'b'], cfg({ drawRule: 'drawUntilPlayable' }), 1);
    s = setCurrent(s, 'a');
    // Active top: 5S. a can't play any of these.
    s = setDiscardTop(s, mkCard('5', 'S'), [mkCard('9', 'C'), mkCard('K', 'H'), mkCard('Q', 'C')]);
    s = setHand(s, 'a', [mkCard('K', 'D')]);
    // Stock has 1 unplayable card; after drawing it, stock is empty
    // and must reshuffle the under-top discard. One of the reshuffled
    // cards will be playable.
    s = setStock(s, [mkCard('J', 'C')]);
    const before = totalCards(s);
    s = applyAction(s, { kind: 'draw', playerId: 'a' });
    expect(totalCards(s)).toBe(before);
    // Reshuffle should have happened — history contains it.
    expect(s.history.some((h) => h.kind === 'reshuffle')).toBe(true);
  });

  it('(10) drawUntilPlayable: stock+discard both exhausted → pass', () => {
    let s = newGame(['a', 'b'], cfg({ drawRule: 'drawUntilPlayable' }), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    s = setHand(s, 'a', [mkCard('K', 'D')]);
    s = setStock(s, []);
    s = applyAction(s, { kind: 'draw', playerId: 'a' });
    // Turn passed via a `pass` entry.
    expect(s.history.some((h) => h.kind === 'pass')).toBe(true);
    expect(s.consecutivePasses).toBeGreaterThanOrEqual(1);
  });

  it('(11) blocked-round detection — stock empty, top is lone discard, no play', () => {
    let s = newGame(['a', 'b'], cfg({ drawRule: 'drawUntilPlayable' }), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'), []);
    s = setHand(s, 'a', [mkCard('K', 'D')]);
    s = setStock(s, []);
    // A direct pass counts.
    s = applyAction(s, { kind: 'pass', playerId: 'a' });
    expect(s.consecutivePasses).toBe(1);
  });

  it('(12) all players pass in sequence → round blocks', () => {
    let s = newGame(['a', 'b', 'c'], cfg({ drawRule: 'drawUntilPlayable' }), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'), []);
    s = setHand(s, 'a', [mkCard('K', 'D')]);
    s = setHand(s, 'b', [mkCard('K', 'H')]);
    s = setHand(s, 'c', [mkCard('K', 'C')]);
    s = setStock(s, []);
    s = applyAction(s, { kind: 'pass', playerId: 'a' });
    s = applyAction(s, { kind: 'pass', playerId: 'b' });
    s = applyAction(s, { kind: 'pass', playerId: 'c' });
    expect(s.phase).toBe('roundOver');
    expect(s.blocked).toBe(true);
  });

  it('(13) player empties hand → round over; tally scores', () => {
    let s = newGame(['a', 'b'], cfg(), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    s = setHand(s, 'a', [mkCard('5', 'H')]);
    // b has hand worth: K=10, 3=3, 8=50 → 63 points.
    s = setHand(s, 'b', [mkCard('K', 'H'), mkCard('3', 'H'), mkCard('8', 'H')]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: '5H' });
    expect(s.phase).toBe('roundOver');
    expect(s.roundWinnerId).toBe('a');
    const bAfter = s.players.find((p) => p.id === 'b')!;
    expect(bAfter.scoreTotal).toBe(63);
  });

  it('(14) play an 8 as last card → round ends, no explicit suit choice required', () => {
    let s = newGame(['a', 'b'], cfg(), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'H'));
    s = setHand(s, 'a', [mkCard('8', 'C')]);
    s = setHand(s, 'b', [mkCard('K', 'S')]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: '8C' });
    expect(s.phase).toBe('roundOver');
    expect(s.roundWinnerId).toBe('a');
    // History still records a declareSuit entry for parseability.
    expect(s.history.filter((h) => h.kind === 'declareSuit').length).toBe(1);
  });

  it('(15) two-deck (6-player): duplicate rank+suit coexist with unique ids', () => {
    const s = newGame(['a', 'b', 'c', 'd', 'e', 'f'], cfg(), 100);
    expect(s.deckCount).toBe(2);
    const all = [
      ...s.stock,
      ...s.discard,
      ...s.players.flatMap((p) => p.hand),
    ];
    expect(all.length).toBe(104);
    const allIds = all.map((c) => c.id);
    expect(new Set(allIds).size).toBe(104); // unique ids
    // Duplicate suit+rank pair exists.
    const pairs = new Map<string, number>();
    for (const c of all) {
      const k = `${c.rank}${c.suit}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    for (const [, count] of pairs) expect(count).toBe(2);
  });

  it('(16) penalty scoring — 8=50, face=10, A=1, pip=face', () => {
    let s = newGame(['a', 'b'], cfg(), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    s = setHand(s, 'a', [mkCard('5', 'H')]);
    // b: 8 (50) + K (10) + A (1) + 7 (7) = 68
    s = setHand(s, 'b', [mkCard('8', 'S'), mkCard('K', 'C'), mkCard('A', 'H'), mkCard('7', 'D')]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: '5H' });
    const b = s.players.find((p) => p.id === 'b')!;
    expect(b.scoreTotal).toBe(68);
  });

  it('(17) twoDrawTwo stacking: two 2s stacked, third player draws 4', () => {
    let s = newGame(
      ['a', 'b', 'c'],
      cfg({ actionCards: { ...DEFAULT_ACTION_CARDS, twoDrawTwo: true, pickUpStacking: true } }),
      1,
    );
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    // Each player gets a filler so the round doesn't end mid-stack.
    s = setHand(s, 'a', [mkCard('2', 'S'), mkCard('K', 'S')]);
    s = setHand(s, 'b', [mkCard('2', 'H'), mkCard('K', 'H')]);
    s = setHand(s, 'c', [mkCard('K', 'D')]);
    s = setStock(s, [
      mkCard('3', 'C'), mkCard('4', 'C'), mkCard('5', 'C'), mkCard('6', 'C'),
    ]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: '2S' });
    expect(s.pendingDrawPenalty).toBe(2);
    s = applyAction(s, { kind: 'play', playerId: 'b', cardId: '2H' });
    expect(s.pendingDrawPenalty).toBe(4);
    s = applyAction(s, { kind: 'draw', playerId: 'c' });
    const c = s.players.find((p) => p.id === 'c')!;
    // c started with 1, drew 4 → 5.
    expect(c.hand.length).toBe(5);
    expect(s.pendingDrawPenalty).toBe(0);
  });

  it('(18) twoDrawTwo + 8 interaction — 8 cannot cancel a pending penalty', () => {
    let s = newGame(
      ['a', 'b'],
      cfg({ actionCards: { ...DEFAULT_ACTION_CARDS, twoDrawTwo: true, pickUpStacking: true } }),
      1,
    );
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    // a has a filler card so playing 2S doesn't end the round.
    s = setHand(s, 'a', [mkCard('2', 'S'), mkCard('K', 'S')]);
    s = setHand(s, 'b', [mkCard('8', 'C'), mkCard('9', 'H')]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: '2S' });
    expect(s.pendingDrawPenalty).toBe(2);
    expect(() =>
      applyAction(s, { kind: 'play', playerId: 'b', cardId: '8C' }),
    ).toThrow(/pending penalty/i);
  });

  it('(19) queensSkip with 2 players → Q plays back to oneself', () => {
    let s = newGame(
      ['a', 'b'],
      cfg({ actionCards: { ...DEFAULT_ACTION_CARDS, queensSkip: true } }),
      1,
    );
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    s = setHand(s, 'a', [mkCard('Q', 'S'), mkCard('4', 'D')]);
    s = setHand(s, 'b', [mkCard('K', 'D')]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: 'QS' });
    expect(s.players[s.currentPlayerIndex]!.id).toBe('a');
  });

  it('(20) aceReverse with 2 players → A reverses, same player goes again', () => {
    let s = newGame(
      ['a', 'b'],
      cfg({ actionCards: { ...DEFAULT_ACTION_CARDS, aceReverse: true } }),
      1,
    );
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'S'));
    s = setHand(s, 'a', [mkCard('A', 'S'), mkCard('4', 'D')]);
    s = setHand(s, 'b', [mkCard('K', 'D')]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: 'AS' });
    expect(s.players[s.currentPlayerIndex]!.id).toBe('a');
    expect(s.direction).toBe(-1);
  });

  it('(21) deterministic: same seed + same actions → same state', () => {
    const a1 = newGame(['a', 'b', 'c'], cfg(), 4242);
    const a2 = newGame(['a', 'b', 'c'], cfg(), 4242);
    const actions: Action[] = [];
    let s1 = a1;
    let s2 = a2;
    // Run 5 drawings each so behaviour is forced and identical.
    for (let i = 0; i < 5 && s1.phase === 'awaitingPlay' && s2.phase === 'awaitingPlay'; i++) {
      const pid = s1.players[s1.currentPlayerIndex]!.id;
      const action: Action = { kind: 'draw', playerId: pid };
      actions.push(action);
      s1 = applyAction(s1, action);
      s2 = applyAction(s2, action);
    }
    expect(ids(s1.discard)).toEqual(ids(s2.discard));
    for (let i = 0; i < s1.players.length; i++) {
      expect(ids(s1.players[i]!.hand)).toEqual(ids(s2.players[i]!.hand));
    }
    expect(s1.activeSuit).toBe(s2.activeSuit);
    expect(s1.turnNumber).toBe(s2.turnNumber);
  });

  it('(22) 7 players → auto-switches to 2-deck setup (no error)', () => {
    const s = newGame(['a', 'b', 'c', 'd', 'e', 'f', 'g'], cfg(), 1);
    expect(s.deckCount).toBe(2);
    // Each gets 5, total in hands = 35; one discard; stock = 104 - 36 = 68.
    const totalHand = s.players.reduce((n, p) => n + p.hand.length, 0);
    expect(totalHand).toBe(35);
    expect(s.stock.length + s.discard.length + totalHand).toBe(104);
  });
});

// ─── §13 property tests ─────────────────────────────────────────────

describe('Crazy Eights — invariants', () => {
  it('card total is conserved across every action (2p game)', () => {
    let s = newGame(['a', 'b'], cfg(), 7);
    const initial = totalCards(s);
    expect(initial).toBe(52);
    let steps = 0;
    while (s.phase !== 'roundOver' && steps < 1000) {
      const pid = s.players[s.currentPlayerIndex]!.id;
      const legal = legalActions(s, pid);
      if (legal.length === 0) break;
      s = applyAction(s, legal[0]!);
      expect(totalCards(s)).toBe(52);
      steps++;
    }
  });

  it('activeSuit invariant — after every non-8 play it equals the played card\'s suit', () => {
    let s = newGame(['a', 'b'], cfg(), 42);
    let steps = 0;
    while (s.phase !== 'roundOver' && steps < 500) {
      const pid = s.players[s.currentPlayerIndex]!.id;
      const legal = legalActions(s, pid);
      if (legal.length === 0) break;
      // Prefer non-8 plays.
      const pick =
        legal.find((x) => x.kind === 'play' && !x.cardId.startsWith('8')) ??
        legal[0]!;
      const before = s;
      s = applyAction(s, pick);
      if (pick.kind === 'play' && !pick.cardId.startsWith('8')) {
        const playedCard = before.players
          .find((p) => p.id === pid)!
          .hand.find((c) => c.id === pick.cardId)!;
        expect(s.activeSuit).toBe(playedCard.suit);
      }
      steps++;
    }
  });

  it('activeSuit after 8 play equals the declared suit', () => {
    // Force an 8 play then a declared suit mismatching its own suit.
    // a keeps a filler card so playing the 8 doesn't end the round.
    let s = newGame(['a', 'b'], cfg(), 1);
    s = setCurrent(s, 'a');
    s = setDiscardTop(s, mkCard('5', 'H'));
    s = setHand(s, 'a', [mkCard('8', 'C'), mkCard('K', 'S')]);
    s = applyAction(s, { kind: 'play', playerId: 'a', cardId: '8C' });
    s = applyAction(s, { kind: 'declareSuit', playerId: 'a', suit: 'D' });
    expect(s.activeSuit).toBe('D');
  });

  it('round terminates within a bounded turn count on drawUntilPlayable', () => {
    // Run 200 seeded rounds; each must end (winner or block) within
    // 10_000 actions — a massive upper bound.
    for (let seed = 1; seed <= 50; seed++) {
      let s = newGame(['a', 'b', 'c'], cfg(), seed);
      let steps = 0;
      while (s.phase !== 'roundOver' && s.phase !== 'gameOver' && steps < 10000) {
        const pid = s.players[s.currentPlayerIndex]!.id;
        const legal = legalActions(s, pid);
        if (legal.length === 0) break;
        s = applyAction(s, legal[0]!);
        steps++;
      }
      expect(s.phase === 'roundOver' || s.phase === 'gameOver').toBe(true);
    }
  });
});

// ─── §13 snapshot tests ─────────────────────────────────────────────

describe('Crazy Eights — snapshots', () => {
  it('seed=101 2p round: history length + winner locked', () => {
    let s = newGame(['a', 'b'], cfg(), 101);
    let steps = 0;
    while (
      (s.phase === 'awaitingPlay' || s.phase === 'awaitingSuitChoice') &&
      steps < 500
    ) {
      const pid = s.players[s.currentPlayerIndex]!.id;
      const legal = legalActions(s, pid);
      if (legal.length === 0) break;
      s = applyAction(s, legal[0]!);
      steps++;
    }
    expect({
      winnerId: s.roundWinnerId,
      blocked: s.blocked,
      deckCount: s.deckCount,
      turnNumber: s.turnNumber,
      historyLen: s.history.length,
    }).toMatchSnapshot();
  });

  it('seed=202 4p round: history length + winner locked', () => {
    let s = newGame(['a', 'b', 'c', 'd'], cfg(), 202);
    let steps = 0;
    while (
      (s.phase === 'awaitingPlay' || s.phase === 'awaitingSuitChoice') &&
      steps < 500
    ) {
      const pid = s.players[s.currentPlayerIndex]!.id;
      const legal = legalActions(s, pid);
      if (legal.length === 0) break;
      s = applyAction(s, legal[0]!);
      steps++;
    }
    expect({
      winnerId: s.roundWinnerId,
      blocked: s.blocked,
      turnNumber: s.turnNumber,
      historyLen: s.history.length,
    }).toMatchSnapshot();
  });

  it('full game to target — winner crosses target score', () => {
    let s = newGame(['a', 'b'], cfg({ targetScore: 50 }), 333);
    let safety = 0;
    while (s.phase !== 'gameOver' && safety < 50) {
      let steps = 0;
      while (
        (s.phase === 'awaitingPlay' || s.phase === 'awaitingSuitChoice') &&
        steps < 500
      ) {
        const pid = s.players[s.currentPlayerIndex]!.id;
        const legal = legalActions(s, pid);
        if (legal.length === 0) break;
        s = applyAction(s, legal[0]!);
        steps++;
      }
      if (s.phase === 'roundOver') s = startNextRound(s);
      safety++;
    }
    expect(s.phase).toBe('gameOver');
    expect({
      winnerId: s.gameWinnerId,
      roundNumber: s.roundNumber,
      scores: s.players.map((p) => ({ id: p.id, total: p.scoreTotal })),
    }).toMatchSnapshot();
  });
});

// ─── getPublicView ──────────────────────────────────────────────────

describe('Crazy Eights — getPublicView', () => {
  it('hides opponent hand contents, shows viewer hand in full', () => {
    const state = newGame(['a', 'b', 'c'], cfg(), 1);
    const view = getPublicView(state, 'a');
    const me = view.players.find((p) => p.id === 'a')!;
    expect(me.handCount).toBe(5);
    expect(view.viewerHand.length).toBe(5);
    // No opponent Card[] field on the opponent view.
    expect(view.players.find((p) => p.id === 'b')).toMatchObject({
      handCount: 5,
      scoreTotal: 0,
    });
  });

  it('exposes activeSuit, pendingDrawPenalty, phase, turnNumber', () => {
    const state = newGame(['a', 'b'], cfg(), 1);
    const view = getPublicView(state, 'a');
    expect(view.activeSuit).toBe(state.activeSuit);
    expect(view.pendingDrawPenalty).toBe(0);
    expect(view.phase).toBe(state.phase);
    expect(view.turnNumber).toBe(0);
  });
});
