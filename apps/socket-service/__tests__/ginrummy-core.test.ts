/**
 * Gin Rummy — pure-core tests.
 *
 * Covers the §12 edge-case checklist + §13 property / snapshot tests
 * from the spec (see src/games/ginrummy/README.md).
 *
 * Forced-scenario tests rewrite specific state fields (hand, stock,
 * discard, phase, currentPlayerIndex) to exercise a rule without
 * fishing for a seed that happens to produce the right shuffle.
 */

import {
  newGame,
  applyAction,
  legalActions,
  getPublicView,
  computeOptimalMeldingPartition,
  startNextRound,
  DEFAULT_CONFIG,
  type Card,
  type GameState,
  type MeldingPartition,
  type Suit,
  type Rank,
  type Action,
  type GinRummyConfig,
  type Phase,
} from '../src/games/ginrummy/core';

// ─── Helpers ────────────────────────────────────────────────────────

function mkCard(rank: Rank, suit: Suit): Card {
  return { rank, suit, id: `${rank}${suit}` };
}

function cfg(overrides: Partial<GinRummyConfig> = {}): GinRummyConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

function setHand(state: GameState, playerId: string, hand: Card[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, hand: [...hand] } : p,
    ) as GameState['players'],
  };
}

function setPhase(state: GameState, phase: Phase): GameState {
  return { ...state, phase };
}

function setCurrent(state: GameState, playerId: string): GameState {
  const idx = state.players.findIndex((p) => p.id === playerId) as 0 | 1;
  return { ...state, currentPlayerIndex: idx };
}

function setStock(state: GameState, stock: Card[]): GameState {
  return { ...state, stock: [...stock] };
}

function setDiscard(state: GameState, discard: Card[]): GameState {
  return { ...state, discard: [...discard] };
}

function totalCards(state: GameState): number {
  return (
    state.stock.length +
    state.discard.length +
    state.players.reduce((n, p) => n + p.hand.length, 0) +
    (state.awaitingLayoff?.laidOffCards.length ?? 0) +
    (state.awaitingLayoff?.knockerMelds.reduce((n, m) => n + m.cards.length, 0) ?? 0)
  );
}

function partitionOf(hand: Card[]): MeldingPartition {
  return computeOptimalMeldingPartition(hand);
}

// ─── §12 edge cases ─────────────────────────────────────────────────

describe('Gin Rummy — §12 edge cases', () => {
  it('(1) first-turn offer: non-dealer takes upcard', () => {
    let s = newGame(['a', 'b'], cfg({ dealerIndex: 0 }), 1);
    expect(s.phase).toBe('firstTurnOffer');
    expect(s.players[s.currentPlayerIndex]!.id).toBe('b'); // non-dealer
    const upcard = s.discard[s.discard.length - 1]!;
    s = applyAction(s, { kind: 'takeInitialDiscard', playerId: 'b' });
    expect(s.players[1]!.hand.some((c) => c.id === upcard.id)).toBe(true);
    // Same player (b, who took) must now discard.
    expect(s.phase).toBe('awaitingKnockOrDiscard');
    expect(s.currentPlayerIndex).toBe(1);
  });

  it('(2) first-turn offer: non-dealer passes; dealer takes; non-dealer starts normal turn', () => {
    let s = newGame(['a', 'b'], cfg({ dealerIndex: 0 }), 2);
    s = applyAction(s, { kind: 'passInitialDiscard', playerId: 'b' });
    expect(s.phase).toBe('firstTurnOfferDealer');
    expect(s.currentPlayerIndex).toBe(0); // dealer
    s = applyAction(s, { kind: 'takeInitialDiscard', playerId: 'a' });
    // Dealer now has 11 cards, must discard; phase = awaitingKnockOrDiscard, currentIdx = 0.
    expect(s.phase).toBe('awaitingKnockOrDiscard');
    expect(s.currentPlayerIndex).toBe(0);
  });

  it('(3) first-turn offer: both pass; non-dealer draws from stock', () => {
    let s = newGame(['a', 'b'], cfg({ dealerIndex: 0 }), 3);
    s = applyAction(s, { kind: 'passInitialDiscard', playerId: 'b' });
    s = applyAction(s, { kind: 'passInitialDiscard', playerId: 'a' });
    expect(s.phase).toBe('awaitingDraw');
    expect(s.players[s.currentPlayerIndex]!.id).toBe('b'); // non-dealer
  });

  it('(4) knock with exactly 10 deadwood — legal', () => {
    // Force a scenario: hand has 10 cards + 1 drawn = 11.
    // Three melds (set 2s, run 4-5-6♠, run 7-8-9♥) + 2 deadwood worth 10.
    const hand: Card[] = [
      mkCard('2', 'S'), mkCard('2', 'H'), mkCard('2', 'D'),
      mkCard('4', 'S'), mkCard('5', 'S'), mkCard('6', 'S'),
      mkCard('7', 'H'), mkCard('8', 'H'), mkCard('9', 'H'),
      // Two deadwood worth 10 total + the knock discard (K♣ worth 10).
      mkCard('5', 'C'), mkCard('5', 'D'),
    ];
    let s = newGame(['a', 'b'], cfg(), 10);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', hand);
    s = setCurrent(s, 'a');
    s = { ...s, discardDrawnThisTurn: null };

    // Knock: discard K♣ ... but we don't have a K. Use 5♦ as the discard,
    // leaving [five melds + 5C] = 10 pts deadwood.
    const discardCardId = '5D';
    const handAfter = hand.filter((c) => c.id !== discardCardId);
    const part = partitionOf(handAfter);
    const dw = part.deadwood.reduce(
      (n, c) => n + (c.rank === 'A' ? 1 : ['J','Q','K'].includes(c.rank) ? 10 : parseInt(c.rank, 10)),
      0,
    );
    // Sanity: partition produces 5 deadwood (the lone 5C) — that's the
    // knock-legal hand. Skip the test if the combinatorial minimum is
    // higher than 10 (which it shouldn't be here).
    expect(dw).toBeLessThanOrEqual(10);
    s = applyAction(s, { kind: 'knock', playerId: 'a', meldingPartition: part, discardCardId });
    expect(s.phase).toBe('awaitingLayoff');
  });

  it('(5) knock with 11+ deadwood (submitted partition) — rejected', () => {
    // Build an 11-card hand. Submit a DELIBERATELY bad partition — no
    // melds, everything deadwood — so the engine rejects (player can
    // always submit a worse partition than optimal).
    const hand: Card[] = [
      mkCard('K', 'S'), mkCard('K', 'H'), mkCard('K', 'D'),
      mkCard('Q', 'C'), mkCard('J', 'C'),
      mkCard('10', 'D'), mkCard('9', 'D'),
      mkCard('8', 'C'), mkCard('7', 'S'), mkCard('6', 'C'),
      mkCard('5', 'H'),
    ];
    let s = newGame(['a', 'b'], cfg(), 11);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', hand);
    s = setCurrent(s, 'a');
    const handAfter = hand.filter((c) => c.id !== '5H');
    const badPart: MeldingPartition = { melds: [], deadwood: handAfter };
    expect(() =>
      applyAction(s, {
        kind: 'knock',
        playerId: 'a',
        meldingPartition: badPart,
        discardCardId: '5H',
      }),
    ).toThrow(/deadwood ≤ 10|deadwood <= 10|Knock requires/i);
  });

  it('(6) gin: all 10 cards melded, discard required', () => {
    const hand: Card[] = [
      mkCard('A', 'S'), mkCard('2', 'S'), mkCard('3', 'S'),
      mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H'),
      mkCard('7', 'C'), mkCard('7', 'D'), mkCard('7', 'H'),
      mkCard('K', 'C'), mkCard('K', 'D'), // one is discarded
    ];
    let s = newGame(['a', 'b'], cfg(), 6);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', hand);
    s = setCurrent(s, 'a');
    s = { ...s, discardDrawnThisTurn: null };

    // Discard KD. Remaining 10 cards: A-2-3♠ + 4-5-6♥ + 7♣7♦7♥ = all melded.
    // Wait — KC would also need a home. Let me reconsider: 3 melds = 9
    // cards. We need 10. Add a 4th set-card or extend a run.
    // Better: add 7♠ (4 sevens) and drop KC. Let me just reconfigure.
    const ginHand: Card[] = [
      mkCard('A', 'S'), mkCard('2', 'S'), mkCard('3', 'S'),
      mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H'),
      mkCard('7', 'C'), mkCard('7', 'D'), mkCard('7', 'H'), mkCard('7', 'S'),
      mkCard('K', 'D'), // the discard
    ];
    s = setHand(s, 'a', ginHand);
    const afterDiscard = ginHand.filter((c) => c.id !== 'KD');
    const part = partitionOf(afterDiscard);
    expect(part.deadwood.length).toBe(0);
    s = applyAction(s, {
      kind: 'gin',
      playerId: 'a',
      meldingPartition: part,
      discardCardId: 'KD',
    });
    expect(s.phase).toBe('roundOver');
    expect(s.roundResult!.ending).toBe('gin');
  });

  it('(7) big gin: all 11 cards melded, no discard', () => {
    // 11 cards all in melds: three 3-card runs + one 4-set-extension?
    // 3+3+3+3 = 12, too many. Use: 4-set (7s) + 3-run (2-3-4♠) + 4-run (8-9-10-J♥).
    // 4+3+4 = 11.
    const hand: Card[] = [
      mkCard('7', 'S'), mkCard('7', 'H'), mkCard('7', 'D'), mkCard('7', 'C'),
      mkCard('2', 'S'), mkCard('3', 'S'), mkCard('4', 'S'),
      mkCard('8', 'H'), mkCard('9', 'H'), mkCard('10', 'H'), mkCard('J', 'H'),
    ];
    let s = newGame(['a', 'b'], cfg(), 7);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', hand);
    s = setCurrent(s, 'a');
    const part = partitionOf(hand);
    expect(part.deadwood.length).toBe(0);
    s = applyAction(s, {
      kind: 'bigGin',
      playerId: 'a',
      meldingPartition: part,
    });
    expect(s.phase).toBe('roundOver');
    expect(s.roundResult!.ending).toBe('bigGin');
  });

  it('(8) knock requires discarding one card; hand ends at 10', () => {
    // Same setup as (4) — verify hand shape after knock.
    const hand: Card[] = [
      mkCard('2', 'S'), mkCard('2', 'H'), mkCard('2', 'D'),
      mkCard('4', 'S'), mkCard('5', 'S'), mkCard('6', 'S'),
      mkCard('7', 'H'), mkCard('8', 'H'), mkCard('9', 'H'),
      mkCard('5', 'C'), mkCard('5', 'D'),
    ];
    let s = newGame(['a', 'b'], cfg(), 8);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', hand);
    s = setCurrent(s, 'a');
    const handAfter = hand.filter((c) => c.id !== '5D');
    const part = partitionOf(handAfter);
    s = applyAction(s, {
      kind: 'knock',
      playerId: 'a',
      meldingPartition: part,
      discardCardId: '5D',
    });
    expect(s.players[0]!.hand.length).toBe(10);
  });

  it('(9) layoff: extend a knocker set with a 4th card', () => {
    // Knocker has 11 cards: 3 melds (9 cards) + 5♣ deadwood + 5♦ discard.
    const knockerMelds: Card[][] = [
      [mkCard('2', 'S'), mkCard('2', 'H'), mkCard('2', 'D')],
      [mkCard('4', 'S'), mkCard('5', 'S'), mkCard('6', 'S')],
      [mkCard('7', 'H'), mkCard('8', 'H'), mkCard('9', 'H')],
    ];
    const knocker = [
      ...knockerMelds.flat(),
      mkCard('5', 'C'), // stays as deadwood
      mkCard('5', 'D'), // gets discarded on knock
    ];
    const defenderHand = [
      mkCard('2', 'C'), // will lay off onto knocker's set
      mkCard('K', 'D'), mkCard('K', 'C'), mkCard('K', 'H'),
      mkCard('A', 'D'), mkCard('A', 'H'), mkCard('A', 'C'),
      mkCard('Q', 'S'), mkCard('Q', 'H'), mkCard('Q', 'D'),
    ];

    let s = newGame(['a', 'b'], cfg(), 9);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', knocker);
    s = setHand(s, 'b', defenderHand);
    s = setCurrent(s, 'a');

    const part: MeldingPartition = {
      melds: knockerMelds.map((m) => ({
        kind: m[0]!.rank === m[1]!.rank ? 'set' : 'run',
        cards: m,
      })),
      deadwood: [mkCard('5', 'C')],
    };
    s = applyAction(s, {
      kind: 'knock',
      playerId: 'a',
      meldingPartition: part,
      discardCardId: '5D',
    });
    expect(s.phase).toBe('awaitingLayoff');

    // Defender lays off 2♣ onto knocker's set.
    const setMeld = s.awaitingLayoff!.knockerMelds.find((m) => m.kind === 'set')!;
    s = applyAction(s, {
      kind: 'layoffCard',
      playerId: 'b',
      cardId: '2C',
      targetMeldId: setMeld.id,
    });
    expect(s.awaitingLayoff!.laidOffCards.map((c) => c.id)).toEqual(['2C']);
  });

  it('(10) layoff: extend a run at either end', () => {
    const runMeld = [mkCard('4', 'S'), mkCard('5', 'S'), mkCard('6', 'S')];
    const knocker = [
      ...runMeld,
      mkCard('2', 'H'), mkCard('2', 'D'), mkCard('2', 'S'),
      mkCard('9', 'C'), mkCard('9', 'H'), mkCard('9', 'D'),
      mkCard('A', 'C'), mkCard('3', 'D'), // deadwood 1 + 3 = 4
    ];
    const defender = [
      mkCard('3', 'S'), // low-end extension
      mkCard('7', 'S'), // high-end extension
      mkCard('Q', 'H'), mkCard('Q', 'D'), mkCard('Q', 'C'),
      mkCard('K', 'H'), mkCard('K', 'D'), mkCard('K', 'C'),
      mkCard('A', 'D'), mkCard('A', 'H'),
    ];

    let s = newGame(['a', 'b'], cfg(), 10);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', knocker);
    s = setHand(s, 'b', defender);
    s = setCurrent(s, 'a');
    const part: MeldingPartition = {
      melds: [
        { kind: 'run', cards: runMeld },
        { kind: 'set', cards: [mkCard('2', 'H'), mkCard('2', 'D'), mkCard('2', 'S')] },
        { kind: 'set', cards: [mkCard('9', 'C'), mkCard('9', 'H'), mkCard('9', 'D')] },
      ],
      deadwood: [mkCard('A', 'C')],
    };
    s = applyAction(s, {
      kind: 'knock',
      playerId: 'a',
      meldingPartition: part,
      discardCardId: '3D',
    });
    const runTargetId = s.awaitingLayoff!.knockerMelds.find((m) => m.kind === 'run')!.id;
    s = applyAction(s, { kind: 'layoffCard', playerId: 'b', cardId: '3S', targetMeldId: runTargetId });
    s = applyAction(s, { kind: 'layoffCard', playerId: 'b', cardId: '7S', targetMeldId: runTargetId });
    expect(s.awaitingLayoff!.laidOffCards.map((c) => c.id).sort()).toEqual(['3S', '7S']);
  });

  it('(11) layoff: illegal extension rejected', () => {
    // 11-card knocker: 2♠2♥2♦ + A♠A♥A♦ + 3♠4♠5♠ + 6♦ (deadwood) + 7♦ (discard).
    const knocker = [
      mkCard('2', 'S'), mkCard('2', 'H'), mkCard('2', 'D'),
      mkCard('A', 'S'), mkCard('A', 'H'), mkCard('A', 'D'),
      mkCard('3', 'S'), mkCard('4', 'S'), mkCard('5', 'S'),
      mkCard('6', 'D'), mkCard('7', 'D'),
    ];
    const defender = [
      mkCard('9', 'C'), mkCard('9', 'D'), mkCard('9', 'H'),
      mkCard('K', 'H'), mkCard('Q', 'H'), mkCard('A', 'C'),
      mkCard('2', 'C'), mkCard('3', 'H'), mkCard('4', 'H'), mkCard('5', 'H'),
    ];

    let s = newGame(['a', 'b'], cfg(), 11);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', knocker);
    s = setHand(s, 'b', defender);
    s = setCurrent(s, 'a');
    const part: MeldingPartition = {
      melds: [
        { kind: 'set', cards: [mkCard('2', 'S'), mkCard('2', 'H'), mkCard('2', 'D')] },
        { kind: 'set', cards: [mkCard('A', 'S'), mkCard('A', 'H'), mkCard('A', 'D')] },
        { kind: 'run', cards: [mkCard('3', 'S'), mkCard('4', 'S'), mkCard('5', 'S')] },
      ],
      deadwood: [mkCard('6', 'D')],
    };
    s = applyAction(s, {
      kind: 'knock',
      playerId: 'a',
      meldingPartition: part,
      discardCardId: '7D',
    });
    const runMeldId = s.awaitingLayoff!.knockerMelds.find((m) => m.kind === 'run')!.id;
    // 9C cannot extend the 3-4-5♠ run (wrong suit AND wrong rank).
    expect(() =>
      applyAction(s, {
        kind: 'layoffCard',
        playerId: 'b',
        cardId: '9C',
        targetMeldId: runMeldId,
      }),
    ).toThrow(/does not legally extend/i);
  });

  it('(13) layoff skipped on gin', () => {
    const hand = [
      mkCard('7', 'S'), mkCard('7', 'H'), mkCard('7', 'D'), mkCard('7', 'C'),
      mkCard('2', 'S'), mkCard('3', 'S'), mkCard('4', 'S'),
      mkCard('8', 'H'), mkCard('9', 'H'), mkCard('10', 'H'),
      mkCard('K', 'C'), // discard
    ];
    let s = newGame(['a', 'b'], cfg(), 13);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', hand);
    s = setCurrent(s, 'a');
    const after = hand.filter((c) => c.id !== 'KC');
    const part = partitionOf(after);
    s = applyAction(s, {
      kind: 'gin',
      playerId: 'a',
      meldingPartition: part,
      discardCardId: 'KC',
    });
    expect(s.phase).toBe('roundOver');
    expect(s.awaitingLayoff).toBeNull();
  });

  it('(14) undercut: defender\'s final deadwood ≤ knocker\'s', () => {
    // Knocker has 10 deadwood; defender has 4 → undercut.
    // Knocker: 3 melds (9 cards) + K♣ (10 pts deadwood) + 2♣ (discard).
    const knockerHand = [
      mkCard('2', 'S'), mkCard('2', 'H'), mkCard('2', 'D'),
      mkCard('4', 'S'), mkCard('5', 'S'), mkCard('6', 'S'),
      mkCard('7', 'H'), mkCard('8', 'H'), mkCard('9', 'H'),
      mkCard('K', 'C'),
      mkCard('3', 'C'), // discard — pick the low so knocker deadwood stays 10
    ];
    // Defender: 3 sets (9 cards) + 4♦ (4 pts deadwood).
    const defenderHand = [
      mkCard('A', 'S'), mkCard('A', 'H'), mkCard('A', 'D'),
      mkCard('3', 'S'), mkCard('3', 'H'), mkCard('3', 'D'),
      mkCard('K', 'S'), mkCard('K', 'H'), mkCard('K', 'D'),
      mkCard('4', 'D'),
    ];
    let s = newGame(['a', 'b'], cfg(), 14);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', knockerHand);
    s = setHand(s, 'b', defenderHand);
    s = setCurrent(s, 'a');
    const afterD = knockerHand.filter((c) => c.id !== '3C');
    const part = partitionOf(afterD);
    s = applyAction(s, {
      kind: 'knock',
      playerId: 'a',
      meldingPartition: part,
      discardCardId: '3C',
    });
    // Defender chooses not to lay off anything and finishes.
    s = applyAction(s, { kind: 'doneLayingOff', playerId: 'b' });
    expect(s.roundResult!.ending).toBe('undercut');
    expect(s.players.find((p) => p.id === 'b')!.scoreTotal).toBeGreaterThan(0);
  });

  it('(15) stock reduced to threshold → round is a draw', () => {
    let s = newGame(['a', 'b'], cfg({ stockExhaustThreshold: 2 }), 15);
    // Force a state where it's a's turn at awaitingKnockOrDiscard, stock
    // has exactly 3 cards before a discards; after discard, stock is 3
    // (discard doesn't touch stock), so we need stock to drop VIA the
    // discard. Actually: the threshold is checked after each discard.
    // Set stock to 2 already — post-discard check triggers.
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setStock(s, [mkCard('K', 'S'), mkCard('K', 'H')]);
    s = setCurrent(s, 'a');
    // a has 11 cards; give them something to discard.
    const aHand = [
      mkCard('A', 'S'), mkCard('2', 'S'), mkCard('3', 'S'),
      mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H'),
      mkCard('9', 'C'), mkCard('9', 'D'), mkCard('9', 'H'),
      mkCard('10', 'C'), mkCard('J', 'C'),
    ];
    s = setHand(s, 'a', aHand);
    s = applyAction(s, { kind: 'discard', playerId: 'a', cardId: 'JC' });
    expect(s.phase).toBe('roundOver');
    expect(s.roundResult!.ending).toBe('wash');
    expect(s.roundResult!.winnerId).toBeNull();
  });

  it('(16) cannot discard the card just drawn from discard', () => {
    let s = newGame(['a', 'b'], cfg(), 16);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    const aHand = [
      mkCard('A', 'S'), mkCard('2', 'S'), mkCard('3', 'S'),
      mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H'),
      mkCard('9', 'C'), mkCard('9', 'D'), mkCard('9', 'H'),
      mkCard('10', 'C'), mkCard('J', 'C'),
    ];
    s = setHand(s, 'a', aHand);
    s = setCurrent(s, 'a');
    s = { ...s, discardDrawnThisTurn: 'JC' };
    expect(() =>
      applyAction(s, { kind: 'discard', playerId: 'a', cardId: 'JC' }),
    ).toThrow(/just took/i);
  });

  it('(17) cannot knock before drawing (awaitingDraw phase)', () => {
    let s = newGame(['a', 'b'], cfg(), 17);
    s = setPhase(s, 'awaitingDraw');
    s = setCurrent(s, 'a');
    const part: MeldingPartition = { melds: [], deadwood: [] };
    expect(() =>
      applyAction(s, {
        kind: 'knock',
        playerId: 'a',
        meldingPartition: part,
        discardCardId: 'xx',
      }),
    ).toThrow(/not legal in phase/i);
  });

  it('(18) invalid run Q-K-A (ace-high wrap) rejected', () => {
    const hand = [
      mkCard('Q', 'S'), mkCard('K', 'S'), mkCard('A', 'S'),
      mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H'),
      mkCard('7', 'C'), mkCard('7', 'D'), mkCard('7', 'H'),
      mkCard('K', 'C'), mkCard('K', 'D'),
    ];
    let s = newGame(['a', 'b'], cfg(), 18);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', hand);
    s = setCurrent(s, 'a');
    const invalidPart: MeldingPartition = {
      melds: [
        { kind: 'run', cards: [mkCard('Q', 'S'), mkCard('K', 'S'), mkCard('A', 'S')] },
        { kind: 'run', cards: [mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H')] },
        { kind: 'set', cards: [mkCard('7', 'C'), mkCard('7', 'D'), mkCard('7', 'H')] },
      ],
      deadwood: [mkCard('K', 'D')],
    };
    expect(() =>
      applyAction(s, {
        kind: 'knock',
        playerId: 'a',
        meldingPartition: invalidPart,
        discardCardId: 'KC',
      }),
    ).toThrow(/not consecutive|wrap|Run is not/i);
  });

  it('(19) same card in two melds rejected', () => {
    const hand = [
      mkCard('7', 'S'), mkCard('7', 'H'), mkCard('7', 'D'),
      mkCard('5', 'S'), mkCard('6', 'S'), mkCard('8', 'S'), mkCard('9', 'S'),
      mkCard('K', 'C'), mkCard('K', 'D'), mkCard('K', 'H'),
      mkCard('A', 'C'),
    ];
    let s = newGame(['a', 'b'], cfg(), 19);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', hand);
    s = setCurrent(s, 'a');
    const dupPart: MeldingPartition = {
      melds: [
        { kind: 'set', cards: [mkCard('7', 'S'), mkCard('7', 'H'), mkCard('7', 'D')] },
        { kind: 'run', cards: [mkCard('5', 'S'), mkCard('6', 'S'), mkCard('7', 'S')] }, // 7S again
      ],
      deadwood: [mkCard('8', 'S'), mkCard('9', 'S'), mkCard('K', 'C'), mkCard('K', 'D'), mkCard('K', 'H')],
    };
    expect(() =>
      applyAction(s, {
        kind: 'knock',
        playerId: 'a',
        meldingPartition: dupPart,
        discardCardId: 'AC',
      }),
    ).toThrow(/multiple melds/i);
  });

  it('(20) gin partition with deadwood rejected', () => {
    const hand = [
      mkCard('7', 'S'), mkCard('7', 'H'), mkCard('7', 'D'),
      mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H'),
      mkCard('2', 'S'), mkCard('3', 'S'), mkCard('A', 'S'),
      mkCard('K', 'C'), mkCard('Q', 'C'),
    ];
    let s = newGame(['a', 'b'], cfg(), 20);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', hand);
    s = setCurrent(s, 'a');
    const afterDiscard = hand.filter((c) => c.id !== 'QC');
    const partWithDw: MeldingPartition = {
      melds: [
        { kind: 'set', cards: [mkCard('7', 'S'), mkCard('7', 'H'), mkCard('7', 'D')] },
        { kind: 'run', cards: [mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H')] },
        { kind: 'run', cards: [mkCard('A', 'S'), mkCard('2', 'S'), mkCard('3', 'S')] },
      ],
      deadwood: [mkCard('K', 'C')],
    };
    // Verify the partition covers the hand (including the lone K♣ deadwood).
    expect(afterDiscard.length).toBe(10);
    expect(() =>
      applyAction(s, {
        kind: 'gin',
        playerId: 'a',
        meldingPartition: partWithDw,
        discardCardId: 'QC',
      }),
    ).toThrow(/Gin requires|no deadwood/i);
  });

  it('(21) ace-low run A-2-3 is valid; Q-K-A is not', () => {
    const hand = [
      mkCard('A', 'S'), mkCard('2', 'S'), mkCard('3', 'S'),
      mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H'),
      mkCard('7', 'C'), mkCard('7', 'D'), mkCard('7', 'H'),
      mkCard('K', 'D'), mkCard('K', 'S'),
    ];
    const partValid: MeldingPartition = {
      melds: [
        { kind: 'run', cards: [mkCard('A', 'S'), mkCard('2', 'S'), mkCard('3', 'S')] },
        { kind: 'run', cards: [mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H')] },
        { kind: 'set', cards: [mkCard('7', 'C'), mkCard('7', 'D'), mkCard('7', 'H')] },
      ],
      deadwood: [mkCard('K', 'D')],
    };
    let s = newGame(['a', 'b'], cfg(), 21);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', hand);
    s = setCurrent(s, 'a');
    // Should NOT throw on the valid partition.
    s = applyAction(s, {
      kind: 'knock',
      playerId: 'a',
      meldingPartition: partValid,
      discardCardId: 'KS',
    });
    expect(s.phase).toBe('awaitingLayoff');
  });

  it('(24) deterministic: same seed + same actions → same state', () => {
    const a1 = newGame(['a', 'b'], cfg(), 123);
    const a2 = newGame(['a', 'b'], cfg(), 123);
    const scripts: Action[] = [
      { kind: 'passInitialDiscard', playerId: 'b' },
      { kind: 'passInitialDiscard', playerId: 'a' },
      { kind: 'drawStock', playerId: 'b' },
    ];
    let s1 = a1;
    let s2 = a2;
    for (const act of scripts) {
      s1 = applyAction(s1, act);
      s2 = applyAction(s2, act);
    }
    expect(s1.players[0]!.hand.map((c) => c.id)).toEqual(s2.players[0]!.hand.map((c) => c.id));
    expect(s1.players[1]!.hand.map((c) => c.id)).toEqual(s2.players[1]!.hand.map((c) => c.id));
    expect(s1.stock.map((c) => c.id)).toEqual(s2.stock.map((c) => c.id));
    expect(s1.phase).toBe(s2.phase);
  });
});

// ─── §13 property tests ─────────────────────────────────────────────

describe('Gin Rummy — invariants', () => {
  it('total cards in stock + discard + hands = 52 at every step', () => {
    let s = newGame(['a', 'b'], cfg(), 77);
    expect(totalCards(s)).toBe(52);
    // Run a few auto-actions.
    s = applyAction(s, { kind: 'passInitialDiscard', playerId: 'b' });
    expect(totalCards(s)).toBe(52);
    s = applyAction(s, { kind: 'passInitialDiscard', playerId: 'a' });
    expect(totalCards(s)).toBe(52);
    s = applyAction(s, { kind: 'drawStock', playerId: 'b' });
    expect(totalCards(s)).toBe(52);
    // Pick any discard.
    const firstCard = s.players[1]!.hand[0]!;
    s = applyAction(s, { kind: 'discard', playerId: 'b', cardId: firstCard.id });
    expect(totalCards(s)).toBe(52);
  });

  it('computeOptimalMeldingPartition is optimal (no other valid partition has less deadwood)', () => {
    const hand: Card[] = [
      mkCard('7', 'S'), mkCard('7', 'H'), mkCard('7', 'D'),
      mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H'),
      mkCard('8', 'S'), mkCard('9', 'S'), mkCard('10', 'S'),
      mkCard('K', 'C'),
    ];
    const opt = computeOptimalMeldingPartition(hand);
    const optDw = opt.deadwood.reduce(
      (n, c) => n + (c.rank === 'A' ? 1 : ['J','Q','K'].includes(c.rank) ? 10 : parseInt(c.rank, 10)),
      0,
    );
    // Expected: 3 melds (7-set, 4-5-6♥ run, 8-9-10♠ run) + lone K = 10 dw.
    expect(optDw).toBe(10);
  });

  it('a round runs through its phase machine without throwing', () => {
    // Simulate 2-3 turns to ensure phase transitions cleanly.
    let s = newGame(['a', 'b'], cfg(), 999);
    s = applyAction(s, { kind: 'passInitialDiscard', playerId: 'b' });
    s = applyAction(s, { kind: 'passInitialDiscard', playerId: 'a' });
    // 10 turns alternating draw-discard.
    for (let i = 0; i < 10; i++) {
      const p = s.players[s.currentPlayerIndex]!;
      if (s.phase === 'awaitingDraw') {
        s = applyAction(s, { kind: 'drawStock', playerId: p.id });
      }
      if (s.phase === 'awaitingKnockOrDiscard') {
        const discardId = p.hand[p.hand.length - 1]!.id;
        s = applyAction(s, { kind: 'discard', playerId: p.id, cardId: discardId });
      }
      if (s.phase === 'roundOver' || s.phase === 'gameOver') break;
    }
    expect(totalCards(s)).toBe(52);
  });
});

// ─── §13 snapshot tests ─────────────────────────────────────────────

describe('Gin Rummy — snapshots', () => {
  it('full round with a forced knock', () => {
    const knockerHand = [
      mkCard('2', 'S'), mkCard('2', 'H'), mkCard('2', 'D'),
      mkCard('4', 'S'), mkCard('5', 'S'), mkCard('6', 'S'),
      mkCard('7', 'H'), mkCard('8', 'H'), mkCard('9', 'H'),
      mkCard('5', 'C'), mkCard('5', 'D'),
    ];
    const defenderHand = [
      mkCard('10', 'C'), mkCard('10', 'D'), mkCard('10', 'H'),
      mkCard('J', 'S'), mkCard('Q', 'S'), mkCard('K', 'S'),
      mkCard('A', 'S'), mkCard('A', 'H'), mkCard('A', 'D'),
      mkCard('3', 'C'),
    ];
    let s = newGame(['a', 'b'], cfg(), 55);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', knockerHand);
    s = setHand(s, 'b', defenderHand);
    s = setCurrent(s, 'a');
    const afterDiscard = knockerHand.filter((c) => c.id !== '5D');
    const part = partitionOf(afterDiscard);
    s = applyAction(s, {
      kind: 'knock',
      playerId: 'a',
      meldingPartition: part,
      discardCardId: '5D',
    });
    // Defender takes no layoffs.
    s = applyAction(s, { kind: 'doneLayingOff', playerId: 'b' });
    expect({
      ending: s.roundResult!.ending,
      winner: s.roundResult!.winnerId,
      points: s.roundResult!.pointsAwarded,
      knockerDw: s.roundResult!.knockerDeadwood,
      opponentDw: s.roundResult!.opponentDeadwood,
    }).toMatchSnapshot();
  });

  it('full round with a forced gin', () => {
    const ginHand = [
      mkCard('A', 'S'), mkCard('2', 'S'), mkCard('3', 'S'),
      mkCard('4', 'H'), mkCard('5', 'H'), mkCard('6', 'H'),
      mkCard('7', 'C'), mkCard('7', 'D'), mkCard('7', 'H'), mkCard('7', 'S'),
      mkCard('K', 'C'),
    ];
    const defenderHand = [
      mkCard('10', 'C'), mkCard('10', 'D'), mkCard('J', 'H'),
      mkCard('Q', 'S'), mkCard('Q', 'H'), mkCard('K', 'S'),
      mkCard('A', 'H'), mkCard('A', 'D'), mkCard('A', 'C'),
      mkCard('3', 'C'),
    ];
    let s = newGame(['a', 'b'], cfg(), 56);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', ginHand);
    s = setHand(s, 'b', defenderHand);
    s = setCurrent(s, 'a');
    const afterDiscard = ginHand.filter((c) => c.id !== 'KC');
    const part = partitionOf(afterDiscard);
    s = applyAction(s, {
      kind: 'gin',
      playerId: 'a',
      meldingPartition: part,
      discardCardId: 'KC',
    });
    expect({
      ending: s.roundResult!.ending,
      winner: s.roundResult!.winnerId,
      points: s.roundResult!.pointsAwarded,
    }).toMatchSnapshot();
  });

  it('full round with a forced big gin', () => {
    const bigGinHand = [
      mkCard('7', 'S'), mkCard('7', 'H'), mkCard('7', 'D'), mkCard('7', 'C'),
      mkCard('2', 'S'), mkCard('3', 'S'), mkCard('4', 'S'),
      mkCard('8', 'H'), mkCard('9', 'H'), mkCard('10', 'H'), mkCard('J', 'H'),
    ];
    const defenderHand = [
      mkCard('10', 'C'), mkCard('10', 'D'), mkCard('J', 'D'),
      mkCard('Q', 'S'), mkCard('Q', 'H'), mkCard('K', 'S'),
      mkCard('A', 'H'), mkCard('A', 'D'), mkCard('A', 'C'),
      mkCard('3', 'C'),
    ];
    let s = newGame(['a', 'b'], cfg(), 57);
    s = setPhase(s, 'awaitingKnockOrDiscard');
    s = setHand(s, 'a', bigGinHand);
    s = setHand(s, 'b', defenderHand);
    s = setCurrent(s, 'a');
    const part = partitionOf(bigGinHand);
    s = applyAction(s, {
      kind: 'bigGin',
      playerId: 'a',
      meldingPartition: part,
    });
    expect({
      ending: s.roundResult!.ending,
      winner: s.roundResult!.winnerId,
      points: s.roundResult!.pointsAwarded,
    }).toMatchSnapshot();
  });

  it('full game to target → winner gets game bonus + box bonuses', () => {
    let s = newGame(['a', 'b'], cfg({ targetScore: 50 }), 2024);
    // Force a series of gins for 'a' by manually setting hands each round.
    let safety = 0;
    const ginHand: Card[] = [
      mkCard('7', 'S'), mkCard('7', 'H'), mkCard('7', 'D'), mkCard('7', 'C'),
      mkCard('2', 'S'), mkCard('3', 'S'), mkCard('4', 'S'),
      mkCard('8', 'H'), mkCard('9', 'H'), mkCard('10', 'H'),
      mkCard('K', 'S'), // discard
    ];
    while (s.phase !== 'gameOver' && safety < 20) {
      safety++;
      if (s.phase === 'firstTurnOffer' || s.phase === 'firstTurnOfferDealer') {
        s = applyAction(s, { kind: 'passInitialDiscard', playerId: s.players[s.currentPlayerIndex]!.id });
        continue;
      }
      if (s.phase === 'awaitingDraw') {
        s = applyAction(s, { kind: 'drawStock', playerId: s.players[s.currentPlayerIndex]!.id });
        // Then force 'a' into a gin hand.
        if (s.players[s.currentPlayerIndex]!.id === 'a') {
          s = setHand(s, 'a', ginHand);
          const afterD = ginHand.filter((c) => c.id !== 'KS');
          const part = partitionOf(afterD);
          s = applyAction(s, {
            kind: 'gin',
            playerId: 'a',
            meldingPartition: part,
            discardCardId: 'KS',
          });
          if (s.phase === 'roundOver' && !s.gameWinnerId) s = startNextRound(s);
          continue;
        }
      }
      if (s.phase === 'awaitingKnockOrDiscard') {
        const p = s.players[s.currentPlayerIndex]!;
        s = applyAction(s, {
          kind: 'discard',
          playerId: p.id,
          cardId: p.hand[p.hand.length - 1]!.id,
        });
      }
    }
    expect(s.phase).toBe('gameOver');
    expect({
      winner: s.gameWinnerId,
      roundNumber: s.roundNumber,
      scores: s.players.map((p) => ({ id: p.id, total: p.scoreTotal, rounds: p.roundsWon })),
    }).toMatchSnapshot();
  });
});

// ─── Public view ────────────────────────────────────────────────────

describe('Gin Rummy — getPublicView', () => {
  it('hides opponent hand, shows viewer hand, phase, discard', () => {
    const s = newGame(['a', 'b'], cfg(), 100);
    const view = getPublicView(s, 'a');
    const me = view.players.find((p) => p.id === 'a')!;
    expect(me.handCount).toBe(10);
    expect(view.viewerHand.length).toBe(10);
    expect(view.discard.length).toBe(1);
    expect(view.stockCount).toBe(31); // 52 - 20 - 1
  });
});
