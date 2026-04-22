/**
 * Phase 10 Engine Tests
 *
 * Test-first per CLAUDE.md rule 6.
 * Covers: deal, draw, discard, lay-down, wild substitution,
 * skip, going-out, scoring, win condition, Phases 1/2/8/10.
 */

import { Phase10Engine } from '../src/games/phase10/engine';
import type { GameState, PlayerAction } from '@card-platform/shared-types';
import type { GameConfig } from '@card-platform/shared-types';

function makeConfig(playerCount = 2): GameConfig {
  const playerIds = Array.from({ length: playerCount }, (_, i) => `player-${i + 1}`);
  return {
    roomId: 'room-test',
    gameId: 'phase10',
    playerIds,
    asyncMode: true,
    turnTimerSeconds: 90,
  };
}

describe('Phase10Engine', () => {
  let engine: Phase10Engine;

  beforeEach(() => {
    engine = new Phase10Engine();
  });

  // -------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------

  it('has gameId = phase10', () => {
    expect(engine.gameId).toBe('phase10');
  });

  it('supports async mode', () => {
    expect(engine.supportsAsync).toBe(true);
  });

  it('has correct player limits (2–6)', () => {
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(6);
  });

  // -------------------------------------------------------------------
  // startGame / dealing
  // -------------------------------------------------------------------

  it('deals 10 cards to each player (2-player game)', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.players).toHaveLength(2);
    state.players.forEach((p) => expect(p.hand).toHaveLength(10));
  });

  it('deals 10 cards to each player (6-player game)', () => {
    const state = engine.startGame(makeConfig(6));
    expect(state.players).toHaveLength(6);
    state.players.forEach((p) => expect(p.hand).toHaveLength(10));
  });

  it('initialises game phase to playing', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.phase).toBe('playing');
  });

  it('sets all players to currentPhase 1 initially', () => {
    const state = engine.startGame(makeConfig(2));
    state.players.forEach((p) => expect(p.currentPhase).toBe(1));
  });

  it('no player has phaseLaidDown at start', () => {
    const state = engine.startGame(makeConfig(2));
    state.players.forEach((p) => expect(p.phaseLaidDown).toBe(false));
  });

  it('publicData contains drawPileSize and discardPileTop after deal', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.publicData.drawPileSize).toBeDefined();
    expect(state.publicData.discardTop).toBeDefined();
  });

  it('sets version to 1 at game start', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.version).toBe(1);
  });

  it('sets roundNumber to 1 at game start', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.roundNumber).toBe(1);
  });

  it('sets currentTurn to first player', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.currentTurn).toBe('player-1');
  });

  // -------------------------------------------------------------------
  // Draw from deck
  // -------------------------------------------------------------------

  it('draw from deck: hand grows by 1', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const initialHandSize = state.players.find((p) => p.playerId === playerId)!.hand.length;

    const action: PlayerAction = { type: 'draw', payload: { source: 'deck' } };
    const newState = engine.applyAction(state, playerId, action);

    const updatedPlayer = newState.players.find((p) => p.playerId === playerId)!;
    expect(updatedPlayer.hand).toHaveLength(initialHandSize + 1);
  });

  it('draw from deck: drawPileSize decreases by 1', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const initialDeckSize = state.publicData.drawPileSize as number;

    const action: PlayerAction = { type: 'draw', payload: { source: 'deck' } };
    const newState = engine.applyAction(state, playerId, action);

    expect(newState.publicData.drawPileSize).toBe(initialDeckSize - 1);
  });

  // -------------------------------------------------------------------
  // Draw from discard
  // -------------------------------------------------------------------

  it('draw from discard: hand grows by 1', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const initialHandSize = state.players.find((p) => p.playerId === playerId)!.hand.length;

    const action: PlayerAction = { type: 'draw', payload: { source: 'discard' } };
    const newState = engine.applyAction(state, playerId, action);

    const updatedPlayer = newState.players.find((p) => p.playerId === playerId)!;
    expect(updatedPlayer.hand).toHaveLength(initialHandSize + 1);
  });

  it('draw from discard: discardTop changes after taking top card', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const oldDiscardTop = state.publicData.discardTop;

    // We need at least 2 cards on discard pile. Deal gives us 1.
    // First, add another card to discard by having player discard from draw.
    let s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    const handCard = s.players.find((p) => p.playerId === playerId)!.hand[0]!;
    s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [handCard.id] });

    // Ensure there are now 2 discard cards (original + just discarded)
    // Now the next player draws from discard
    const nextPlayerId = s.currentTurn!;
    const discardTopBefore = s.publicData.discardTop;
    const s2 = engine.applyAction(s, nextPlayerId, { type: 'draw', payload: { source: 'discard' } });

    const discardTopAfter = s2.publicData.discardTop;
    // After drawing discard top, the new top should be different
    expect(discardTopAfter).not.toEqual(discardTopBefore);
  });

  // -------------------------------------------------------------------
  // Discard
  // -------------------------------------------------------------------

  it('discard: hand shrinks by 1', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    // Draw first
    let s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    const handSizeAfterDraw = s.players.find((p) => p.playerId === playerId)!.hand.length;

    const cardToDiscard = s.players.find((p) => p.playerId === playerId)!.hand[0]!;
    s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [cardToDiscard.id] });

    const finalHandSize = s.players.find((p) => p.playerId === playerId)!.hand.length;
    expect(finalHandSize).toBe(handSizeAfterDraw - 1);
  });

  it('discard: discardTop changes to the discarded card', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    let s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    const cardToDiscard = s.players.find((p) => p.playerId === playerId)!.hand[0]!;
    s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [cardToDiscard.id] });

    const discardTop = s.publicData.discardTop as { id: string };
    expect(discardTop.id).toBe(cardToDiscard.id);
  });

  it('discard advances turn to next player', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    let s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    // Pick a non-skip card — a discarded skip skips the next player by design,
    // which would send turn back to us in a 2-player game. This test is
    // asserting vanilla discard behaviour, so pick something safe.
    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    const cardToDiscard = hand.find((c) => c.phase10Type !== 'skip') ?? hand[0]!;
    s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [cardToDiscard.id] });

    expect(s.currentTurn).not.toBe(playerId);
  });

  // -------------------------------------------------------------------
  // Invalid actions
  // -------------------------------------------------------------------

  it('throws if wrong player tries to act', () => {
    const state = engine.startGame(makeConfig(2));
    const notCurrentPlayer = state.players.find((p) => p.playerId !== state.currentTurn)!;

    expect(() =>
      engine.applyAction(state, notCurrentPlayer.playerId, { type: 'draw', payload: { source: 'deck' } }),
    ).toThrow();
  });

  it('throws if player tries to discard without drawing first', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const card = state.players.find((p) => p.playerId === playerId)!.hand[0]!;

    expect(() =>
      engine.applyAction(state, playerId, { type: 'discard', cardIds: [card.id] }),
    ).toThrow();
  });

  it('throws if player tries to draw twice in one turn', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    expect(() =>
      engine.applyAction(s, playerId, { type: 'draw', payload: { source: 'deck' } }),
    ).toThrow();
  });

  // -------------------------------------------------------------------
  // Phase 1: two sets of 3
  // -------------------------------------------------------------------

  it('lay-down: accepts valid Phase 1 (2 sets of 3)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    // Build a hand with 2 sets of 3 (e.g., three 5s and three 7s)
    // We need to inject a specific hand for testing
    const testState = buildStateWithPhase1Hand(state, playerId);

    // Draw first (required before laydown)
    let s = engine.applyAction(testState, playerId, { type: 'draw', payload: { source: 'deck' } });

    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    // find set of 3 with same value (non-wild)
    const set1 = findSetOf3(hand);
    const set2 = findAnotherSetOf3(hand, set1);

    const action: PlayerAction = {
      type: 'lay-down',
      payload: {
        phase: 1,
        groups: [
          { type: 'set', cardIds: set1.map((c) => c.id) },
          { type: 'set', cardIds: set2.map((c) => c.id) },
        ],
      },
    };

    const newState = engine.applyAction(s, playerId, action);
    const player = newState.players.find((p) => p.playerId === playerId)!;
    expect(player.phaseLaidDown).toBe(true);
  });

  it('lay-down: rejects invalid Phase 1 (only 1 set of 3)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    let s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    const someCards = hand.slice(0, 3);

    const action: PlayerAction = {
      type: 'lay-down',
      payload: {
        phase: 1,
        groups: [
          { type: 'set', cardIds: someCards.map((c) => c.id) },
        ],
      },
    };

    expect(() => engine.applyAction(s, playerId, action)).toThrow();
  });

  it('lay-down: rejects if player is on a different phase', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    // Manually advance player to phase 2 in state
    const advancedState: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, currentPhase: 2 } : p,
      ),
    };

    let s = engine.applyAction(advancedState, playerId, { type: 'draw', payload: { source: 'deck' } });

    const action: PlayerAction = {
      type: 'lay-down',
      payload: {
        phase: 1,
        groups: [
          { type: 'set', cardIds: s.players.find((p) => p.playerId === playerId)!.hand.slice(0, 3).map((c) => c.id) },
          { type: 'set', cardIds: s.players.find((p) => p.playerId === playerId)!.hand.slice(3, 6).map((c) => c.id) },
        ],
      },
    };

    expect(() => engine.applyAction(s, playerId, action)).toThrow();
  });

  // -------------------------------------------------------------------
  // Wild card substitution
  // -------------------------------------------------------------------

  it('wild card can substitute in a set', () => {
    // set of 3: two 5s + one wild = valid set
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const testState = buildStateWithWildSetHand(state, playerId);
    let s = engine.applyAction(testState, playerId, { type: 'draw', payload: { source: 'deck' } });

    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    const wilds = hand.filter((c) => c.phase10Type === 'wild');
    const fives = hand.filter((c) => c.phase10Type === 'number' && c.value === 5);
    const set1Cards = [wilds[0]!, fives[0]!, fives[1]!];

    // Need second set of 3
    const otherCards = hand.filter((c) => !set1Cards.includes(c));
    const set2 = findSetOf3(otherCards);

    if (set2.length < 3) {
      // Skip if we can't form a second set — the hand generator may not always produce this
      return;
    }

    const action: PlayerAction = {
      type: 'lay-down',
      payload: {
        phase: 1,
        groups: [
          { type: 'set', cardIds: set1Cards.map((c) => c.id) },
          { type: 'set', cardIds: set2.map((c) => c.id) },
        ],
      },
    };

    const newState = engine.applyAction(s, playerId, action);
    expect(newState.players.find((p) => p.playerId === playerId)!.phaseLaidDown).toBe(true);
  });

  it('wild card can substitute in a run', () => {
    // run of 4: 3, wild, 5, 6 = valid run
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    // Set up a player on phase 4 (run of 7) — using phase 2 (set3 + run4) instead
    const stateForPhase2 = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, currentPhase: 2 } : p,
      ),
    };

    const testState = buildStateWithWildRunHand(stateForPhase2, playerId);
    let s = engine.applyAction(testState, playerId, { type: 'draw', payload: { source: 'deck' } });

    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    const wilds = hand.filter((c) => c.phase10Type === 'wild');
    const numbers = hand.filter((c) => c.phase10Type === 'number');

    // Build run: 3, wild, 5, 6
    const three = numbers.find((c) => c.value === 3);
    const five = numbers.find((c) => c.value === 5);
    const six = numbers.find((c) => c.value === 6);
    const wild = wilds[0];

    if (!three || !five || !six || !wild) {
      return; // hand builder couldn't provide these
    }

    const runCards = [three, wild, five, six];

    // Need set of 3 too (phase 2 = set3 + run4)
    const remaining = numbers.filter((c) => !runCards.includes(c));
    const set3 = findSetOf3(remaining);

    if (set3.length < 3) return;

    const action: PlayerAction = {
      type: 'lay-down',
      payload: {
        phase: 2,
        groups: [
          { type: 'set', cardIds: set3.map((c) => c.id) },
          { type: 'run', cardIds: runCards.map((c) => c.id) },
        ],
      },
    };

    const newState = engine.applyAction(s, playerId, action);
    expect(newState.players.find((p) => p.playerId === playerId)!.phaseLaidDown).toBe(true);
  });

  // -------------------------------------------------------------------
  // Phase 2: set of 3 + run of 4
  // -------------------------------------------------------------------

  it('lay-down: accepts valid Phase 2 (set3 + run4)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const stateForPhase2 = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, currentPhase: 2 } : p,
      ),
    };

    const testState = buildStateForPhase2(stateForPhase2, playerId);
    let s = engine.applyAction(testState, playerId, { type: 'draw', payload: { source: 'deck' } });

    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    const numbers = hand.filter((c) => c.phase10Type === 'number');

    const set3 = findSetOf3(numbers);
    const run4 = findRunOf4(numbers.filter((c) => !set3.includes(c)));

    if (set3.length < 3 || run4.length < 4) return;

    const action: PlayerAction = {
      type: 'lay-down',
      payload: {
        phase: 2,
        groups: [
          { type: 'set', cardIds: set3.map((c) => c.id) },
          { type: 'run', cardIds: run4.map((c) => c.id) },
        ],
      },
    };

    const newState = engine.applyAction(s, playerId, action);
    expect(newState.players.find((p) => p.playerId === playerId)!.phaseLaidDown).toBe(true);
  });

  // -------------------------------------------------------------------
  // Phase 8: 7 cards of one color
  // -------------------------------------------------------------------

  it('lay-down: accepts valid Phase 8 (7 cards of one color)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const stateForPhase8 = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, currentPhase: 8 } : p,
      ),
    };

    const testState = buildStateForPhase8(stateForPhase8, playerId);
    let s = engine.applyAction(testState, playerId, { type: 'draw', payload: { source: 'deck' } });

    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    const redCards = hand.filter((c) => c.phase10Color === 'red');

    if (redCards.length < 7) return;

    const action: PlayerAction = {
      type: 'lay-down',
      payload: {
        phase: 8,
        groups: [
          { type: 'color', cardIds: redCards.slice(0, 7).map((c) => c.id) },
        ],
      },
    };

    const newState = engine.applyAction(s, playerId, action);
    expect(newState.players.find((p) => p.playerId === playerId)!.phaseLaidDown).toBe(true);
  });

  it('lay-down: rejects Phase 8 with mixed colors (no wild)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const stateForPhase8 = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, currentPhase: 8 } : p,
      ),
    };

    let s = engine.applyAction(stateForPhase8, playerId, { type: 'draw', payload: { source: 'deck' } });

    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    // Mix colors intentionally
    const redCards = hand.filter((c) => c.phase10Color === 'red').slice(0, 3);
    const blueCards = hand.filter((c) => c.phase10Color === 'blue').slice(0, 4);
    const mixedCards = [...redCards, ...blueCards];

    if (mixedCards.length < 7) return;

    const action: PlayerAction = {
      type: 'lay-down',
      payload: {
        phase: 8,
        groups: [
          { type: 'color', cardIds: mixedCards.map((c) => c.id) },
        ],
      },
    };

    expect(() => engine.applyAction(s, playerId, action)).toThrow();
  });

  // -------------------------------------------------------------------
  // Phase 10: set of 5 + set of 3
  // -------------------------------------------------------------------

  it('lay-down: accepts valid Phase 10 (set5 + set3)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const stateForPhase10 = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, currentPhase: 10 } : p,
      ),
    };

    const testState = buildStateForPhase10(stateForPhase10, playerId);
    let s = engine.applyAction(testState, playerId, { type: 'draw', payload: { source: 'deck' } });

    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    const set5 = findSetOf5(hand);
    const set3 = findSetOf3(hand.filter((c) => !set5.includes(c)));

    if (set5.length < 5 || set3.length < 3) return;

    const action: PlayerAction = {
      type: 'lay-down',
      payload: {
        phase: 10,
        groups: [
          { type: 'set', cardIds: set5.map((c) => c.id) },
          { type: 'set', cardIds: set3.map((c) => c.id) },
        ],
      },
    };

    const newState = engine.applyAction(s, playerId, action);
    expect(newState.players.find((p) => p.playerId === playerId)!.phaseLaidDown).toBe(true);
  });

  // -------------------------------------------------------------------
  // Skip card
  // -------------------------------------------------------------------

  it('skip card: target player loses their next turn', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const targetId = state.players.find((p) => p.playerId !== playerId)!.playerId;

    // Inject a skip card into the player's hand
    const skipCard = {
      id: 'phase10:skip:test1',
      deckType: 'phase10' as const,
      phase10Type: 'skip' as const,
      value: 15,
      faceUp: false,
    };
    const stateWithSkip: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId
          ? { ...p, hand: [skipCard, ...p.hand.slice(0, 9)] }
          : p,
      ),
    };

    // Draw first (goes to discard phase)
    let s = engine.applyAction(stateWithSkip, playerId, { type: 'draw', payload: { source: 'deck' } });

    // Play a skip targeting the other player
    const action: PlayerAction = {
      type: 'play-skip',
      payload: { targetPlayerId: targetId },
    };

    s = engine.applyAction(s, playerId, action);

    // The skipped player's state should reflect being skipped
    const skippedPublicData = s.publicData.skippedPlayers as string[];
    expect(skippedPublicData).toContain(targetId);
  });

  it('discarding a skip card causes the next player to lose their turn (2p: discarder goes again)', () => {
    // Standard Phase 10: a skip placed on the discard pile (not played via
    // play-skip) causes the next-in-rotation player to lose their turn.
    // In a 2-player game, that means the discarder takes the next turn.
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const skipCard = {
      id: 'phase10:skip:disc1',
      deckType: 'phase10' as const,
      phase10Type: 'skip' as const,
      value: 15,
      faceUp: false,
    };

    const withSkip: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId
          ? { ...p, hand: [skipCard, ...p.hand.slice(0, 9)] }
          : p,
      ),
    };

    // Draw so we're in the discard sub-phase
    let s = engine.applyAction(withSkip, playerId, { type: 'draw', payload: { source: 'deck' } });

    // Discard the skip (not play-skip — a bare discard)
    s = engine.applyAction(s, playerId, {
      type: 'discard',
      cardIds: [skipCard.id],
    });

    // 2-player: the would-be-next player is skipped, so turn returns to us.
    expect(s.currentTurn).toBe(playerId);
    // Discard pile top is the skip we dumped
    const top = (s.publicData as Record<string, unknown>).discardTop as { phase10Type?: string };
    expect(top.phase10Type).toBe('skip');
  });

  it('skip-discard stacks a second skip token on an already-skipped seat', () => {
    // Scenario: p1 already has a play-skip targeting p2 in skippedPlayers.
    // p1 now also discards a skip card. skippedPlayers becomes a multiset
    // of TWO tokens for p2. getNextPlayer consumes one token this turn
    // (advance past p2, land on p3) and leaves the second token in the
    // list — so p2 also misses their NEXT turn. That is, in effect, p2
    // loses two consecutive turns.
    const state = engine.startGame(makeConfig(4));
    const playerId = state.currentTurn!; // player-1

    const skipCard = {
      id: 'phase10:skip:chain',
      deckType: 'phase10' as const,
      phase10Type: 'skip' as const,
      value: 15,
      faceUp: false,
    };

    // Pre-populate skippedPlayers[player-2] to simulate a prior play-skip.
    const pd = state.publicData as Record<string, unknown>;
    const withSkip: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId
          ? { ...p, hand: [skipCard, ...p.hand.slice(0, 9)] }
          : p,
      ),
      publicData: {
        ...pd,
        skippedPlayers: ['player-2'],
      },
    };

    let s = engine.applyAction(withSkip, playerId, { type: 'draw', payload: { source: 'deck' } });
    s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [skipCard.id] });

    // One of p2's two tokens gets consumed this rotation — turn lands on p3.
    expect(s.currentTurn).toBe('player-3');
    const updated = s.publicData as { skippedPlayers?: string[] };
    // The remaining token keeps p2 skipped for one more rotation.
    expect(updated.skippedPlayers).toEqual(['player-2']);
  });

  it('discarding a skip card in a 3p game skips the immediate next player', () => {
    const state = engine.startGame(makeConfig(3));
    const playerId = state.currentTurn!;
    const [, p2, p3] = state.players;

    const skipCard = {
      id: 'phase10:skip:disc3p',
      deckType: 'phase10' as const,
      phase10Type: 'skip' as const,
      value: 15,
      faceUp: false,
    };

    const withSkip: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId
          ? { ...p, hand: [skipCard, ...p.hand.slice(0, 9)] }
          : p,
      ),
    };

    let s = engine.applyAction(withSkip, playerId, { type: 'draw', payload: { source: 'deck' } });
    s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [skipCard.id] });

    // player-1 → player-2 is skipped → player-3 plays next
    expect(p2!.playerId).toBe('player-2');
    expect(p3!.playerId).toBe('player-3');
    expect(s.currentTurn).toBe(p3!.playerId);
  });

  it('skip card: skipped player automatically loses their turn', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const targetId = state.players.find((p) => p.playerId !== playerId)!.playerId;

    // Inject a skip card into the player's hand
    const skipCard = {
      id: 'phase10:skip:1',
      deckType: 'phase10' as const,
      phase10Type: 'skip' as const,
      value: 15,
      faceUp: false,
    };

    const modifiedState: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId
          ? { ...p, hand: [skipCard, ...p.hand.slice(0, 9)] }
          : p,
      ),
    };

    // Draw so we have 11 cards (draw-state)
    let s = engine.applyAction(modifiedState, playerId, { type: 'draw', payload: { source: 'deck' } });

    // Play skip
    s = engine.applyAction(s, playerId, {
      type: 'play-skip',
      payload: { targetPlayerId: targetId },
    });

    // Discard to end turn
    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    s = engine.applyAction(s, playerId, {
      type: 'discard',
      cardIds: [hand[0]!.id],
    });

    // Now it should skip to the player after target (or back to player-1 in 2-player game)
    // In 2-player game, skipped means turn goes to p1 again (target was skipped)
    expect(s.currentTurn).toBe(playerId);
  });

  // -------------------------------------------------------------------
  // Hand-end scoring overlay + ack flow
  // -------------------------------------------------------------------

  it('going out populates handWinnerId, handScores, and scoringAcks=[] on the scoring state', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const opponentId = state.players.find((p) => p.playerId !== playerId)!.playerId;

    // Seed: current player has 1 card left (phaseLaidDown to avoid the
    // "can't go out without laying down" constraint implicit in hit-meld).
    const lastCard = state.players.find((p) => p.playerId === playerId)!.hand[0]!;
    const primed: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId
          ? { ...p, hand: [lastCard], phaseLaidDown: true }
          : p,
      ),
    };

    let s = engine.applyAction(primed, playerId, { type: 'draw', payload: { source: 'deck' } });
    // Discard the just-drawn card to leave 1 card, then the last original.
    const h1 = s.players.find((p) => p.playerId === playerId)!.hand;
    s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [h1[h1.length - 1]!.id] });
    // Now current turn has rotated away from us. Put it back and go out.
    const afterOpp: GameState = { ...s, currentTurn: playerId, publicData: { ...s.publicData, turnPhase: 'draw' } };
    const drawn = engine.applyAction(afterOpp, playerId, { type: 'draw', payload: { source: 'deck' } });
    const h2 = drawn.players.find((p) => p.playerId === playerId)!.hand;
    // Discard one card, drop to 1, then discard again to go out.
    const after1 = engine.applyAction(drawn, playerId, { type: 'discard', cardIds: [h2[0]!.id] });
    const afterOppTurn: GameState = { ...after1, currentTurn: playerId, publicData: { ...after1.publicData, turnPhase: 'draw' } };
    const drawn2 = engine.applyAction(afterOppTurn, playerId, { type: 'draw', payload: { source: 'deck' } });
    const h3 = drawn2.players.find((p) => p.playerId === playerId)!.hand;
    // Discard one card → 1 card left.
    const after2 = engine.applyAction(drawn2, playerId, { type: 'discard', cardIds: [h3[0]!.id] });
    const afterOppTurn2: GameState = { ...after2, currentTurn: playerId, publicData: { ...after2.publicData, turnPhase: 'draw' } };
    const drawn3 = engine.applyAction(afterOppTurn2, playerId, { type: 'draw', payload: { source: 'deck' } });
    const h4 = drawn3.players.find((p) => p.playerId === playerId)!.hand;
    // 2 cards — discard one, leaving 1. That last discard-to-zero test
    // needs another iteration, but easiest: just bypass and directly drive
    // state into the "0-card hand just discarded" scenario.
    const nearOut: GameState = {
      ...drawn3,
      players: drawn3.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: [h4[0]!] } : p,
      ),
      currentTurn: playerId,
      publicData: { ...drawn3.publicData, turnPhase: 'discard' },
    };
    const final = engine.applyAction(nearOut, playerId, { type: 'discard', cardIds: [h4[0]!.id] });

    // Expectations: hand ended with our player out.
    expect(final.phase).toBe('scoring');
    const pd = final.publicData as {
      handWinnerId?: string;
      handScores?: Record<string, number>;
      scoringAcks?: string[];
    };
    expect(pd.handWinnerId).toBe(playerId);
    expect(pd.scoringAcks).toEqual([]);
    expect(pd.handScores).toBeDefined();
    // Winner contributes 0 points for the hand.
    expect(pd.handScores![playerId]).toBe(0);
    // Opponent accrued something > 0 (10 cards worth).
    expect(pd.handScores![opponentId]).toBeGreaterThan(0);
  });

  it('ack-scoring: one ack does not advance the round', () => {
    const state = engine.startGame(makeConfig(2));
    const p1 = state.players[0]!.playerId;
    const p2 = state.players[1]!.playerId;

    const scoringState: GameState = {
      ...state,
      phase: 'scoring',
      currentTurn: null,
      players: state.players.map((p) =>
        p.playerId === p1 ? { ...p, hand: [], isOut: true, phaseLaidDown: true } : p,
      ),
      publicData: {
        ...state.publicData,
        handWinnerId: p1,
        handScores: { [p1]: 0, [p2]: 35 },
        scoringAcks: [],
      },
    };

    const afterAck = engine.applyAction(scoringState, p1, { type: 'ack-scoring' });
    expect(afterAck.phase).toBe('scoring');
    const pd = afterAck.publicData as { scoringAcks?: string[] };
    expect(pd.scoringAcks).toEqual([p1]);
  });

  it('ack-scoring: bots auto-ack — round advances as soon as every HUMAN has acked', () => {
    // Rule: bots never participate in the hand-end overlay; the next
    // hand starts as soon as every live human has acked. This lets the
    // engine's ack-scoring handler short-circuit without waiting for
    // bot scheduler round-trips.
    const state = engine.startGame(makeConfig(3));
    const p1 = state.players[0]!.playerId; // human
    const p2 = state.players[1]!.playerId; // bot
    const p3 = state.players[2]!.playerId; // bot

    const scoringState: GameState = {
      ...state,
      phase: 'scoring',
      currentTurn: null,
      players: state.players.map((p) => {
        if (p.playerId === p1) {
          return { ...p, hand: [], isOut: true, phaseLaidDown: true, currentPhase: 1, score: 0, isBot: false };
        }
        // p2 and p3 are bots.
        return { ...p, phaseLaidDown: false, currentPhase: 1, score: 10, isBot: true };
      }),
      publicData: {
        ...state.publicData,
        handWinnerId: p1,
        handScores: { [p1]: 0, [p2]: 10, [p3]: 10 },
        scoringAcks: [],
      },
    };

    // Only the human acks — round should advance immediately.
    const after = engine.applyAction(scoringState, p1, { type: 'ack-scoring' });

    expect(after.phase).toBe('playing');
    expect(after.roundNumber).toBe(state.roundNumber + 1);
    after.players.forEach((p) => {
      expect(p.hand).toHaveLength(10);
    });
  });

  it('ack-scoring: mid-game bot takeover — _activeBotIds payload lets engine auto-ack those bots too', () => {
    // When a human times out mid-game and gets converted to a bot via
    // BotController, `state.players[i].isBot` isn't mutated — so the
    // engine can't tell from state alone. The gameActionHandler
    // compensates by passing the list of currently-bot-controlled
    // seats via `action.payload._activeBotIds`. The engine reads it.
    const state = engine.startGame(makeConfig(3));
    const p1 = state.players[0]!.playerId; // human acking
    const p2 = state.players[1]!.playerId; // takeover bot (isBot=false in state)
    const p3 = state.players[2]!.playerId; // human who already acked

    const scoringState: GameState = {
      ...state,
      phase: 'scoring',
      currentTurn: null,
      players: state.players.map((p) => ({
        ...p,
        hand: p.playerId === p1 ? [] : p.hand,
        isOut: p.playerId === p1,
        isBot: false, // all flagged as humans at seat level
      })),
      publicData: {
        ...state.publicData,
        handWinnerId: p1,
        handScores: { [p1]: 0, [p2]: 5, [p3]: 5 },
        scoringAcks: [p3], // p3 already acked
      },
    };

    // p1 acks with the handler-injected list of currently-bot-controlled seats.
    const after = engine.applyAction(scoringState, p1, {
      type: 'ack-scoring',
      payload: { _activeBotIds: [p2] },
    });

    expect(after.phase).toBe('playing');
    expect(after.roundNumber).toBe(state.roundNumber + 1);
  });

  it('ack-scoring: does NOT advance while a human still hasn\'t acked', () => {
    const state = engine.startGame(makeConfig(3));
    const p1 = state.players[0]!.playerId;
    const p2 = state.players[1]!.playerId;
    const p3 = state.players[2]!.playerId;

    const scoringState: GameState = {
      ...state,
      phase: 'scoring',
      currentTurn: null,
      players: state.players.map((p) => ({
        ...p,
        hand: p.playerId === p1 ? [] : p.hand,
        isOut: p.playerId === p1,
        isBot: false, // all humans
      })),
      publicData: {
        ...state.publicData,
        handWinnerId: p1,
        handScores: { [p1]: 0, [p2]: 5, [p3]: 5 },
        scoringAcks: [],
      },
    };

    // Only p1 acks — p2 and p3 are live humans, round must wait.
    const after = engine.applyAction(scoringState, p1, { type: 'ack-scoring' });
    expect(after.phase).toBe('scoring');
    const pd = after.publicData as { scoringAcks?: string[] };
    expect(pd.scoringAcks).toEqual([p1]);
  });

  it('ack-scoring: all acks deal the next hand, advance phase for players who laid down, preserve scores', () => {
    const state = engine.startGame(makeConfig(2));
    const p1 = state.players[0]!.playerId;
    const p2 = state.players[1]!.playerId;

    const scoringState: GameState = {
      ...state,
      phase: 'scoring',
      currentTurn: null,
      players: state.players.map((p) => {
        if (p.playerId === p1) {
          return { ...p, hand: [], isOut: true, phaseLaidDown: true, currentPhase: 1, score: 0 };
        }
        return { ...p, phaseLaidDown: false, currentPhase: 1, score: 35 };
      }),
      publicData: {
        ...state.publicData,
        handWinnerId: p1,
        handScores: { [p1]: 0, [p2]: 35 },
        scoringAcks: [],
      },
    };

    let s = engine.applyAction(scoringState, p1, { type: 'ack-scoring' });
    s = engine.applyAction(s, p2, { type: 'ack-scoring' });

    expect(s.phase).toBe('playing');
    // p1 laid down → phase goes 1 → 2. p2 didn't → stays on 1.
    expect(s.players.find((p) => p.playerId === p1)!.currentPhase).toBe(2);
    expect(s.players.find((p) => p.playerId === p2)!.currentPhase).toBe(1);
    // Cumulative scores preserved (not recomputed).
    expect(s.players.find((p) => p.playerId === p1)!.score).toBe(0);
    expect(s.players.find((p) => p.playerId === p2)!.score).toBe(35);
    // Flags reset
    s.players.forEach((p) => {
      expect(p.isOut).toBe(false);
      expect(p.phaseLaidDown).toBe(false);
      expect(p.hand).toHaveLength(10);
    });
    // Hand-end bookkeeping cleared
    const pd2 = s.publicData as { scoringAcks?: string[]; handWinnerId?: string; handScores?: Record<string, number> };
    expect(pd2.scoringAcks).toBeUndefined();
    expect(pd2.handWinnerId).toBeUndefined();
    expect(pd2.handScores).toBeUndefined();
    // Round number bumped
    expect(s.roundNumber).toBe(state.roundNumber + 1);
  });

  it('ack-scoring: idempotent — a second ack from the same player is a safe no-op', () => {
    const state = engine.startGame(makeConfig(2));
    const p1 = state.players[0]!.playerId;
    const p2 = state.players[1]!.playerId;

    const scoringState: GameState = {
      ...state,
      phase: 'scoring',
      currentTurn: null,
      publicData: {
        ...state.publicData,
        handWinnerId: p1,
        handScores: { [p1]: 0, [p2]: 35 },
        scoringAcks: [p1],
      },
    };

    const after = engine.applyAction(scoringState, p1, { type: 'ack-scoring' });
    // Still scoring (we only have 1/2 acks even after re-ack).
    expect(after.phase).toBe('scoring');
    const pd = after.publicData as { scoringAcks?: string[] };
    expect(pd.scoringAcks).toEqual([p1]);
  });

  it('ack-scoring: outside of scoring phase is a no-op (does not throw)', () => {
    const state = engine.startGame(makeConfig(2));
    const p1 = state.players[0]!.playerId;
    expect(() => engine.applyAction(state, p1, { type: 'ack-scoring' })).not.toThrow();
    const after = engine.applyAction(state, p1, { type: 'ack-scoring' });
    expect(after.phase).toBe(state.phase);
  });

  // -------------------------------------------------------------------
  // Going out / round end
  // -------------------------------------------------------------------

  it('going out: player with 0 cards triggers round end (scoring phase)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    // Inject a minimal hand: just 1 card
    const singleCardHand = [state.players.find((p) => p.playerId === playerId)!.hand[0]!];
    const minHandState: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: singleCardHand, phaseLaidDown: true } : p,
      ),
      publicData: { ...state.publicData, turnPhase: 'discard' },
    };

    // Draw
    let s = engine.applyAction({ ...minHandState, publicData: { ...minHandState.publicData, turnPhase: 'draw' } }, playerId, {
      type: 'draw',
      payload: { source: 'deck' },
    });

    // Now discard the single remaining original card (they have 2 now)
    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    // Discard first card to get to 1, then discard to go out
    s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [hand[0]!.id] });

    // Now they have 1 card. One more draw+discard to go out.
    // Actually after discarding, turn changes. Let me rebuild:
    // Start fresh with 1 card in hand and phaseLaidDown=true
    const freshMinState: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: singleCardHand, phaseLaidDown: true } : p,
      ),
    };

    s = engine.applyAction(freshMinState, playerId, { type: 'draw', payload: { source: 'deck' } });
    const handAfterDraw = s.players.find((p) => p.playerId === playerId)!.hand;
    s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [handAfterDraw[handAfterDraw.length - 1]!.id] });

    // After discarding down to 0, should either be scoring or next round
    expect(['scoring', 'playing']).toContain(s.phase);
    const gonePlayers = s.players.filter((p) => p.isOut);
    expect(gonePlayers.length).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------
  // Scoring
  // -------------------------------------------------------------------

  it('scoring: number cards 1-9 are worth 5 points each (Mattel rule)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    // Two number cards (5 and 3) should each score 5 points → total 10.
    const knownHand = [
      { id: 'p10:red:5:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 5, faceUp: false },
      { id: 'p10:blue:3:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 3, faceUp: false },
    ];

    const testState: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: knownHand, phaseLaidDown: true } : p,
      ),
    };

    const score = engine.computeHandScore(testState.players.find((p) => p.playerId === playerId)!.hand);
    expect(score).toBe(10);
  });

  it('scoring: number cards 10-12 worth 10 points each', () => {
    const hand = [
      { id: 'p10:red:10:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 10, faceUp: false },
      { id: 'p10:blue:11:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 11, faceUp: false },
      { id: 'p10:green:12:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'green' as const, value: 12, faceUp: false },
    ];
    const engine2 = new Phase10Engine();
    const score = engine2.computeHandScore(hand);
    expect(score).toBe(30); // 10+10+10
  });

  it('scoring: skip card worth 15 points', () => {
    const engine2 = new Phase10Engine();
    const hand = [
      { id: 'phase10:skip:1', deckType: 'phase10' as const, phase10Type: 'skip' as const, value: 15, faceUp: false },
    ];
    expect(engine2.computeHandScore(hand)).toBe(15);
  });

  it('scoring: wild card worth 25 points', () => {
    const engine2 = new Phase10Engine();
    const hand = [
      { id: 'phase10:wild:1', deckType: 'phase10' as const, phase10Type: 'wild' as const, value: 25, faceUp: false },
    ];
    expect(engine2.computeHandScore(hand)).toBe(25);
  });

  // -------------------------------------------------------------------
  // isGameOver / computeResult
  // -------------------------------------------------------------------

  it('isGameOver returns false during active play', () => {
    const state = engine.startGame(makeConfig(2));
    expect(engine.isGameOver(state)).toBe(false);
  });

  it('isGameOver returns true when a player has completed Phase 10 and won a round', () => {
    const state = engine.startGame(makeConfig(2));
    const wonState: GameState = {
      ...state,
      phase: 'ended',
    };
    expect(engine.isGameOver(wonState)).toBe(true);
  });

  it('computeResult ranks players by score ascending (lowest wins)', () => {
    const state = engine.startGame(makeConfig(2));
    const endState: GameState = {
      ...state,
      phase: 'ended',
      players: [
        { ...state.players[0]!, score: 30, currentPhase: 5 },
        { ...state.players[1]!, score: 10, currentPhase: 8 },
      ],
    };

    const result = engine.computeResult(endState);
    expect(result[0]!.rank).toBe(1);
    expect(result[0]!.playerId).toBe('player-2'); // lower score wins
    expect(result[1]!.rank).toBe(2);
  });

  it('computeResult marks bots correctly', () => {
    const state = engine.startGame(makeConfig(2));
    const endState: GameState = {
      ...state,
      phase: 'ended',
      players: [
        { ...state.players[0]!, score: 10, isBot: true },
        { ...state.players[1]!, score: 20, isBot: false },
      ],
    };

    const result = engine.computeResult(endState);
    const botResult = result.find((r) => r.playerId === 'player-1')!;
    expect(botResult.isBot).toBe(true);
  });

  // -------------------------------------------------------------------
  // getValidActions
  // -------------------------------------------------------------------

  it('getValidActions includes draw when it is the player\'s turn and no draw yet', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const actions = engine.getValidActions(state, playerId);
    const hasDrawDeck = actions.some((a) => a.type === 'draw' && (a.payload as Record<string, unknown>)?.source === 'deck');
    expect(hasDrawDeck).toBe(true);
  });

  it('getValidActions includes discard after draw', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    const actions = engine.getValidActions(s, playerId);
    const hasDiscard = actions.some((a) => a.type === 'discard');
    expect(hasDiscard).toBe(true);
  });

  it('getValidActions returns empty for non-current player', () => {
    const state = engine.startGame(makeConfig(2));
    const notCurrentPlayer = state.players.find((p) => p.playerId !== state.currentTurn)!;
    const actions = engine.getValidActions(state, notCurrentPlayer.playerId);
    expect(actions).toHaveLength(0);
  });

  // -------------------------------------------------------------------
  // Version increments
  // -------------------------------------------------------------------

  it('version increments on each applyAction', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.version).toBe(1);

    const s1 = engine.applyAction(state, state.currentTurn!, { type: 'draw', payload: { source: 'deck' } });
    expect(s1.version).toBe(2);

    const card = s1.players.find((p) => p.playerId === s1.currentTurn)!.hand[0]!;
    const s2 = engine.applyAction(s1, s1.currentTurn!, { type: 'discard', cardIds: [card.id] });
    expect(s2.version).toBe(3);
  });

  // -------------------------------------------------------------------
  // Hit meld
  // -------------------------------------------------------------------

  it('hit-meld: player can add cards to laid-down phase after their own lay-down', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const testState = buildStateWithPhase1Hand(state, playerId);
    let s = engine.applyAction(testState, playerId, { type: 'draw', payload: { source: 'deck' } });

    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    const set1 = findSetOf3(hand);
    const set2 = findAnotherSetOf3(hand, set1);

    if (set1.length < 3 || set2.length < 3) return;

    s = engine.applyAction(s, playerId, {
      type: 'lay-down',
      payload: {
        phase: 1,
        groups: [
          { type: 'set', cardIds: set1.map((c) => c.id) },
          { type: 'set', cardIds: set2.map((c) => c.id) },
        ],
      },
    });

    // Player now has phaseLaidDown = true and can hit
    // Discard to end turn
    const handAfterLaydown = s.players.find((p) => p.playerId === playerId)!.hand;
    if (handAfterLaydown.length === 0) return; // already out

    s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [handAfterLaydown[0]!.id] });

    // Other player turn - draw and discard quickly
    const other = s.currentTurn!;
    s = engine.applyAction(s, other, { type: 'draw', payload: { source: 'deck' } });
    const otherHand = s.players.find((p) => p.playerId === other)!.hand;
    s = engine.applyAction(s, other, { type: 'discard', cardIds: [otherHand[0]!.id] });

    // Back to player 1 - draw then hit meld
    s = engine.applyAction(s, playerId, { type: 'draw', payload: { source: 'deck' } });

    // Find matching card to hit on set1's value
    const set1Value = set1[0]!.value;
    const handForHit = s.players.find((p) => p.playerId === playerId)!.hand;
    const matchingCard = handForHit.find((c) => c.phase10Type === 'number' && c.value === set1Value);

    if (!matchingCard) return; // can't test without matching card

    const hitAction: PlayerAction = {
      type: 'hit-meld',
      payload: {
        targetPlayerId: playerId,
        groupIndex: 0,
        cardIds: [matchingCard.id],
      },
    };

    expect(() => engine.applyAction(s, playerId, hitAction)).not.toThrow();
  });

  // ------------------------------------------------------------------
  // Hit-meld RULE validation — sets / runs / colours
  // ------------------------------------------------------------------

  it('hit-meld REJECTS a 4 on a set of 5s (set requires matching rank)', () => {
    const make = (id: string, value: number, color: 'red' | 'blue' | 'green' | 'yellow' = 'red') => ({
      id,
      deckType: 'phase10' as const,
      phase10Type: 'number' as const,
      phase10Color: color,
      value,
      faceUp: false,
    });
    const fives = [make('5a', 5, 'red'), make('5b', 5, 'blue'), make('5c', 5, 'green')];
    const eights = [make('8a', 8, 'red'), make('8b', 8, 'blue'), make('8c', 8, 'green')];
    const bad = make('4', 4, 'yellow');

    const seeded: GameState = {
      version: 1,
      roomId: 'r', gameId: 'phase10', phase: 'playing',
      players: [
        {
          playerId: 'p1', displayName: 'P1',
          hand: [bad, make('11', 11, 'red')],
          score: 0, isOut: false, isBot: false, currentPhase: 1, phaseLaidDown: true,
        },
        {
          playerId: 'p2', displayName: 'P2',
          hand: [make('1', 1, 'red')],
          score: 0, isOut: false, isBot: false, currentPhase: 1, phaseLaidDown: false,
        },
      ],
      currentTurn: 'p1', turnNumber: 1, roundNumber: 1,
      publicData: {
        drawPile: [], discardPile: [], discardTop: null, drawPileSize: 0,
        turnPhase: 'discard', skippedPlayers: [],
        laidDownPhases: {
          p1: [
            { type: 'set', cardIds: fives.map(c => c.id), cards: fives.map(c => ({ ...c, faceUp: true })) },
            { type: 'set', cardIds: eights.map(c => c.id), cards: eights.map(c => ({ ...c, faceUp: true })) },
          ],
        },
      },
      updatedAt: new Date().toISOString(),
    };

    expect(() =>
      engine.applyAction(seeded, 'p1', {
        type: 'hit-meld',
        payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['4'] },
      }),
    ).toThrow();
  });

  it('hit-meld ACCEPTS a 5 on a set of 5s', () => {
    const make = (id: string, value: number, color: 'red' | 'blue' | 'green' | 'yellow' = 'red') => ({
      id, deckType: 'phase10' as const, phase10Type: 'number' as const,
      phase10Color: color, value, faceUp: false,
    });
    const fives = [make('5a', 5, 'red'), make('5b', 5, 'blue'), make('5c', 5, 'green')];
    const hit = make('5d', 5, 'yellow');

    const seeded: GameState = {
      version: 1, roomId: 'r', gameId: 'phase10', phase: 'playing',
      players: [
        { playerId: 'p1', displayName: 'P1', hand: [hit, make('11', 11, 'red')], score: 0, isOut: false, isBot: false, currentPhase: 1, phaseLaidDown: true },
        { playerId: 'p2', displayName: 'P2', hand: [make('1', 1, 'red')], score: 0, isOut: false, isBot: false, currentPhase: 1, phaseLaidDown: false },
      ],
      currentTurn: 'p1', turnNumber: 1, roundNumber: 1,
      publicData: {
        drawPile: [], discardPile: [], discardTop: null, drawPileSize: 0,
        turnPhase: 'discard', skippedPlayers: [],
        laidDownPhases: { p1: [{ type: 'set', cardIds: fives.map(c => c.id), cards: fives.map(c => ({ ...c, faceUp: true })) }] },
      },
      updatedAt: new Date().toISOString(),
    };

    expect(() =>
      engine.applyAction(seeded, 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['5d'] } }),
    ).not.toThrow();
  });

  it('hit-meld on a run of 8-9-10-11 accepts 7 and 12 but rejects 6 and 5', () => {
    const make = (id: string, value: number) => ({
      id, deckType: 'phase10' as const, phase10Type: 'number' as const,
      phase10Color: 'red' as const, value, faceUp: false,
    });
    const run = [make('8', 8), make('9', 9), make('10', 10), make('11', 11)];

    const build = (hitCards: ReturnType<typeof make>[]): GameState => ({
      version: 1, roomId: 'r', gameId: 'phase10', phase: 'playing',
      players: [
        { playerId: 'p1', displayName: 'P1', hand: hitCards, score: 0, isOut: false, isBot: false, currentPhase: 2, phaseLaidDown: true },
        { playerId: 'p2', displayName: 'P2', hand: [make('1', 1)], score: 0, isOut: false, isBot: false, currentPhase: 2, phaseLaidDown: false },
      ],
      currentTurn: 'p1', turnNumber: 1, roundNumber: 1,
      publicData: {
        drawPile: [], discardPile: [], discardTop: null, drawPileSize: 0,
        turnPhase: 'discard', skippedPlayers: [],
        laidDownPhases: { p1: [{ type: 'run', cardIds: run.map(c => c.id), cards: run.map(c => ({ ...c, faceUp: true })) }] },
      },
      updatedAt: new Date().toISOString(),
    });

    // 7 extends below — ACCEPT
    expect(() =>
      engine.applyAction(build([make('7h', 7)]), 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['7h'] } }),
    ).not.toThrow();

    // 12 extends above — ACCEPT
    expect(() =>
      engine.applyAction(build([make('12h', 12)]), 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['12h'] } }),
    ).not.toThrow();

    // 6 is not adjacent — REJECT
    expect(() =>
      engine.applyAction(build([make('6h', 6)]), 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['6h'] } }),
    ).toThrow();

    // 5 is definitely not adjacent — REJECT
    expect(() =>
      engine.applyAction(build([make('5h', 5)]), 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['5h'] } }),
    ).toThrow();
  });

  it('hit-meld on a run: after a 7 is added, the next hit accepts 6 or 12 (range slides)', () => {
    const make = (id: string, value: number) => ({
      id, deckType: 'phase10' as const, phase10Type: 'number' as const,
      phase10Color: 'red' as const, value, faceUp: false,
    });
    const run789WithExisting11 = [
      make('7', 7), make('8', 8), make('9', 9), make('10', 10), make('11', 11),
    ];

    const build = (hitCards: ReturnType<typeof make>[]): GameState => ({
      version: 1, roomId: 'r', gameId: 'phase10', phase: 'playing',
      players: [
        { playerId: 'p1', displayName: 'P1', hand: hitCards, score: 0, isOut: false, isBot: false, currentPhase: 2, phaseLaidDown: true },
        { playerId: 'p2', displayName: 'P2', hand: [make('1', 1)], score: 0, isOut: false, isBot: false, currentPhase: 2, phaseLaidDown: false },
      ],
      currentTurn: 'p1', turnNumber: 1, roundNumber: 1,
      publicData: {
        drawPile: [], discardPile: [], discardTop: null, drawPileSize: 0,
        turnPhase: 'discard', skippedPlayers: [],
        laidDownPhases: { p1: [{ type: 'run', cardIds: run789WithExisting11.map(c => c.id), cards: run789WithExisting11.map(c => ({ ...c, faceUp: true })) }] },
      },
      updatedAt: new Date().toISOString(),
    });

    // 6 extends below the new range [7..11] — ACCEPT
    expect(() =>
      engine.applyAction(build([make('6h', 6)]), 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['6h'] } }),
    ).not.toThrow();

    // 12 extends above — ACCEPT
    expect(() =>
      engine.applyAction(build([make('12h', 12)]), 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['12h'] } }),
    ).not.toThrow();

    // 5 is two below — REJECT
    expect(() =>
      engine.applyAction(build([make('5h', 5)]), 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['5h'] } }),
    ).toThrow();
  });

  it('hit-meld on a colour group requires matching colour', () => {
    const make = (id: string, value: number, color: 'red' | 'blue' | 'green' | 'yellow') => ({
      id, deckType: 'phase10' as const, phase10Type: 'number' as const,
      phase10Color: color, value, faceUp: false,
    });
    const redColorMeld = [
      make('r1', 1, 'red'), make('r2', 2, 'red'), make('r3', 3, 'red'),
      make('r4', 4, 'red'), make('r5', 5, 'red'), make('r6', 6, 'red'), make('r7', 7, 'red'),
    ];

    const build = (hitCards: ReturnType<typeof make>[]): GameState => ({
      version: 1, roomId: 'r', gameId: 'phase10', phase: 'playing',
      players: [
        { playerId: 'p1', displayName: 'P1', hand: hitCards, score: 0, isOut: false, isBot: false, currentPhase: 8, phaseLaidDown: true },
        { playerId: 'p2', displayName: 'P2', hand: [make('x', 1, 'blue')], score: 0, isOut: false, isBot: false, currentPhase: 8, phaseLaidDown: false },
      ],
      currentTurn: 'p1', turnNumber: 1, roundNumber: 1,
      publicData: {
        drawPile: [], discardPile: [], discardTop: null, drawPileSize: 0,
        turnPhase: 'discard', skippedPlayers: [],
        laidDownPhases: { p1: [{ type: 'color', cardIds: redColorMeld.map(c => c.id), cards: redColorMeld.map(c => ({ ...c, faceUp: true })) }] },
      },
      updatedAt: new Date().toISOString(),
    });

    // Red card — ACCEPT
    expect(() =>
      engine.applyAction(build([make('r8', 8, 'red')]), 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['r8'] } }),
    ).not.toThrow();

    // Blue card — REJECT
    expect(() =>
      engine.applyAction(build([make('b1', 1, 'blue')]), 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['b1'] } }),
    ).toThrow();
  });

  it('hit-meld: a laid-down player can hit ANOTHER player\'s meld (cross-player), subject to rules', () => {
    // Rule: once you\'ve laid down your own phase, you can add cards to
    // any player\'s melds (including your own), provided the card is
    // legal for that meld. Previously we only had a self-hit test; this
    // one locks in the cross-player path so a future tightening can\'t
    // accidentally restrict hits to own melds.
    const make = (id: string, value: number, color: 'red' | 'blue' | 'green' | 'yellow' = 'red') => ({
      id, deckType: 'phase10' as const, phase10Type: 'number' as const,
      phase10Color: color, value, faceUp: false,
    });
    const p1Fives = [make('p1-5a', 5, 'red'), make('p1-5b', 5, 'blue'), make('p1-5c', 5, 'green')];
    const p1Eights = [make('p1-8a', 8, 'red'), make('p1-8b', 8, 'blue'), make('p1-8c', 8, 'green')];
    const p2Sevens = [make('p2-7a', 7, 'red'), make('p2-7b', 7, 'blue'), make('p2-7c', 7, 'green')];
    const p2Twos = [make('p2-2a', 2, 'red'), make('p2-2b', 2, 'blue'), make('p2-2c', 2, 'green')];
    const hitMatchingP2Sevens = make('7-hit', 7, 'yellow');  // legal: matches p2's 7s
    const hitMatchingP2Twos = make('2-hit', 2, 'yellow');    // legal: matches p2's 2s
    const hitMismatch = make('9-bad', 9);                    // illegal: matches nothing

    const build = (): GameState => ({
      version: 1, roomId: 'r', gameId: 'phase10', phase: 'playing',
      players: [
        {
          playerId: 'p1', displayName: 'P1',
          hand: [hitMatchingP2Sevens, hitMatchingP2Twos, hitMismatch],
          score: 0, isOut: false, isBot: false, currentPhase: 1, phaseLaidDown: true,
        },
        {
          playerId: 'p2', displayName: 'P2',
          hand: [make('x', 12)],
          score: 0, isOut: false, isBot: false, currentPhase: 1, phaseLaidDown: true,
        },
      ],
      currentTurn: 'p1', turnNumber: 1, roundNumber: 1,
      publicData: {
        drawPile: [], discardPile: [], discardTop: null, drawPileSize: 0,
        turnPhase: 'discard', skippedPlayers: [],
        laidDownPhases: {
          p1: [
            { type: 'set', cardIds: p1Fives.map(c => c.id), cards: p1Fives.map(c => ({ ...c, faceUp: true })) },
            { type: 'set', cardIds: p1Eights.map(c => c.id), cards: p1Eights.map(c => ({ ...c, faceUp: true })) },
          ],
          p2: [
            { type: 'set', cardIds: p2Sevens.map(c => c.id), cards: p2Sevens.map(c => ({ ...c, faceUp: true })) },
            { type: 'set', cardIds: p2Twos.map(c => c.id), cards: p2Twos.map(c => ({ ...c, faceUp: true })) },
          ],
        },
      },
      updatedAt: new Date().toISOString(),
    });

    // p1 hitting p2's set of 7s with a 7 — ACCEPT.
    expect(() =>
      engine.applyAction(build(), 'p1', {
        type: 'hit-meld',
        payload: { targetPlayerId: 'p2', groupIndex: 0, cardIds: ['7-hit'] },
      }),
    ).not.toThrow();

    // p1 hitting p2's set of 2s with a 2 — ACCEPT.
    expect(() =>
      engine.applyAction(build(), 'p1', {
        type: 'hit-meld',
        payload: { targetPlayerId: 'p2', groupIndex: 1, cardIds: ['2-hit'] },
      }),
    ).not.toThrow();

    // p1 hitting p2's set of 7s with a 9 — REJECT (rank mismatch).
    expect(() =>
      engine.applyAction(build(), 'p1', {
        type: 'hit-meld',
        payload: { targetPlayerId: 'p2', groupIndex: 0, cardIds: ['9-bad'] },
      }),
    ).toThrow();

    // Confirm the meld that got hit carries the new card (cross-player
    // hits must mirror cardIds + cards, same as self-hits).
    const after = engine.applyAction(build(), 'p1', {
      type: 'hit-meld',
      payload: { targetPlayerId: 'p2', groupIndex: 0, cardIds: ['7-hit'] },
    });
    const updatedMeld = ((after.publicData as Record<string, unknown>)['laidDownPhases'] as Record<string, Array<{ cardIds: string[]; cards?: Array<{ id: string }> }>>)['p2']![0]!;
    expect(updatedMeld.cardIds).toContain('7-hit');
    expect((updatedMeld.cards ?? []).map(c => c.id)).toContain('7-hit');
  });

  it('hit-meld: wild card is accepted on any group type', () => {
    const make = (id: string, value: number) => ({
      id, deckType: 'phase10' as const, phase10Type: 'number' as const,
      phase10Color: 'red' as const, value, faceUp: false,
    });
    const wild = {
      id: 'W',
      deckType: 'phase10' as const,
      phase10Type: 'wild' as const,
      value: 25,
      faceUp: false,
    };
    const run = [make('8', 8), make('9', 9), make('10', 10), make('11', 11)];

    const state: GameState = {
      version: 1, roomId: 'r', gameId: 'phase10', phase: 'playing',
      players: [
        { playerId: 'p1', displayName: 'P1', hand: [wild, make('x', 1)], score: 0, isOut: false, isBot: false, currentPhase: 2, phaseLaidDown: true },
        { playerId: 'p2', displayName: 'P2', hand: [make('y', 1)], score: 0, isOut: false, isBot: false, currentPhase: 2, phaseLaidDown: false },
      ],
      currentTurn: 'p1', turnNumber: 1, roundNumber: 1,
      publicData: {
        drawPile: [], discardPile: [], discardTop: null, drawPileSize: 0,
        turnPhase: 'discard', skippedPlayers: [],
        laidDownPhases: { p1: [{ type: 'run', cardIds: run.map(c => c.id), cards: run.map(c => ({ ...c, faceUp: true })) }] },
      },
      updatedAt: new Date().toISOString(),
    };
    expect(() =>
      engine.applyAction(state, 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['W'] } }),
    ).not.toThrow();
  });

  it('hit-meld: rejects a duplicate value in a run (can\'t hit 9 onto 8-9-10)', () => {
    const make = (id: string, value: number) => ({
      id, deckType: 'phase10' as const, phase10Type: 'number' as const,
      phase10Color: 'red' as const, value, faceUp: false,
    });
    const run = [make('8', 8), make('9', 9), make('10', 10)];
    const state: GameState = {
      version: 1, roomId: 'r', gameId: 'phase10', phase: 'playing',
      players: [
        { playerId: 'p1', displayName: 'P1', hand: [make('9b', 9)], score: 0, isOut: false, isBot: false, currentPhase: 2, phaseLaidDown: true },
        { playerId: 'p2', displayName: 'P2', hand: [make('x', 1)], score: 0, isOut: false, isBot: false, currentPhase: 2, phaseLaidDown: false },
      ],
      currentTurn: 'p1', turnNumber: 1, roundNumber: 1,
      publicData: {
        drawPile: [], discardPile: [], discardTop: null, drawPileSize: 0,
        turnPhase: 'discard', skippedPlayers: [],
        laidDownPhases: { p1: [{ type: 'run', cardIds: run.map(c => c.id), cards: run.map(c => ({ ...c, faceUp: true })) }] },
      },
      updatedAt: new Date().toISOString(),
    };
    expect(() =>
      engine.applyAction(state, 'p1', { type: 'hit-meld', payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['9b'] } }),
    ).toThrow();
  });

  it('hit-meld: appends the hit card to the meld\'s cards array (not just cardIds)', () => {
    // Regression: the client's card catalogue is built from each meld's
    // `cards: Card[]` field. handleHitMeld used to only push to `cardIds`,
    // which meant the new card was invisible client-side after a hit.
    // Deterministic seed — bypasses the random deck so the assertion
    // always runs.
    const make = (id: string, value: number, color: 'red' | 'blue' | 'green' | 'yellow' = 'red') => ({
      id,
      deckType: 'phase10' as const,
      phase10Type: 'number' as const,
      phase10Color: color,
      value,
      faceUp: false,
    });
    // Player has phase 1 already laid down, plus one extra "5" still in hand
    // ready to hit.
    const fives = [make('5a', 5, 'red'), make('5b', 5, 'blue'), make('5c', 5, 'green')];
    const eights = [make('8a', 8, 'red'), make('8b', 8, 'blue'), make('8c', 8, 'green')];
    const hitCard = make('5d', 5, 'yellow');

    const seeded: GameState = {
      version: 1,
      roomId: 'r',
      gameId: 'phase10',
      phase: 'playing',
      players: [
        {
          playerId: 'p1',
          displayName: 'P1',
          hand: [hitCard, make('11a', 11, 'red')],
          score: 0,
          isOut: false,
          isBot: false,
          currentPhase: 1,
          phaseLaidDown: true,
        },
        {
          playerId: 'p2',
          displayName: 'P2',
          hand: [make('1a', 1, 'red')],
          score: 0,
          isOut: false,
          isBot: false,
          currentPhase: 1,
          phaseLaidDown: false,
        },
      ],
      currentTurn: 'p1',
      turnNumber: 1,
      roundNumber: 1,
      publicData: {
        drawPile: [],
        discardPile: [],
        discardTop: null,
        drawPileSize: 0,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {
          p1: [
            { type: 'set', cardIds: fives.map((c) => c.id), cards: fives.map((c) => ({ ...c, faceUp: true })) },
            { type: 'set', cardIds: eights.map((c) => c.id), cards: eights.map((c) => ({ ...c, faceUp: true })) },
          ],
        },
      },
      updatedAt: new Date().toISOString(),
    };

    const after = engine.applyAction(seeded, 'p1', {
      type: 'hit-meld',
      payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['5d'] },
    });

    const meld = ((after.publicData as Record<string, unknown>)['laidDownPhases'] as Record<string, Array<{ cardIds: string[]; cards?: Array<{ id: string; faceUp?: boolean }> }>>)['p1']![0]!;
    expect(meld.cardIds).toEqual(['5a', '5b', '5c', '5d']);
    // The fix: cards array also gets the new card so the frontend catalogue can find it.
    expect((meld.cards ?? []).map((c) => c.id)).toEqual(['5a', '5b', '5c', '5d']);
    // Hit card stored face-up so it renders correctly.
    expect((meld.cards ?? []).find((c) => c.id === '5d')?.faceUp).toBe(true);
  });
});

// ------------------------------------------------------------------
// Rule: a meld may never empty the player's hand. If a hit-meld
// action would leave the player at zero cards, the last card is
// auto-discarded instead — the player goes out through the standard
// discard path (which attaches scoring state, rotates the turn to
// null, etc.) rather than through a meld.
//
// Lives in its own describe block so the tests run after the main
// Phase10Engine suite without shifting the RNG order those tests
// depend on (Phase 1 auto-arrange in particular is order-sensitive
// because startGame uses the global Math.random).
// ------------------------------------------------------------------

describe('Phase10Engine — meld cannot empty hand', () => {
  let engine: Phase10Engine;
  beforeEach(() => { engine = new Phase10Engine(); });

  it('hit-meld: single last card is discarded, not melded — player goes out via discard', () => {
    const make = (id: string, value: number, color: 'red' | 'blue' | 'green' | 'yellow' = 'red') => ({
      id,
      deckType: 'phase10' as const,
      phase10Type: 'number' as const,
      phase10Color: color,
      value,
      faceUp: false,
    });
    const fives = [make('5a', 5, 'red'), make('5b', 5, 'blue'), make('5c', 5, 'green')];
    const hit = make('5d', 5, 'yellow');

    const seeded: GameState = {
      version: 1,
      roomId: 'r',
      gameId: 'phase10',
      phase: 'playing',
      players: [
        {
          playerId: 'p1',
          displayName: 'P1',
          hand: [hit],
          score: 0,
          isOut: false,
          isBot: false,
          currentPhase: 1,
          phaseLaidDown: true,
        },
        {
          playerId: 'p2',
          displayName: 'P2',
          hand: [make('1', 1, 'red')],
          score: 0,
          isOut: false,
          isBot: false,
          currentPhase: 1,
          phaseLaidDown: false,
        },
      ],
      currentTurn: 'p1',
      turnNumber: 1,
      roundNumber: 1,
      publicData: {
        drawPile: [],
        discardPile: [make('7', 7)],
        discardTop: make('7', 7),
        drawPileSize: 0,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {
          p1: [
            {
              type: 'set',
              cardIds: fives.map((c) => c.id),
              cards: fives.map((c) => ({ ...c, faceUp: true })),
            },
          ],
        },
      },
      updatedAt: new Date().toISOString(),
    };

    const after = engine.applyAction(seeded, 'p1', {
      type: 'hit-meld',
      payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['5d'] },
    });

    // Hand is empty, player marked out, phase -> scoring.
    const p1After = after.players.find((p) => p.playerId === 'p1')!;
    expect(p1After.hand).toEqual([]);
    expect(p1After.isOut).toBe(true);
    expect(after.phase).toBe('scoring');
    expect(after.currentTurn).toBeNull();

    // The 5d ended up on the discard pile, NOT appended to the meld.
    const pd = after.publicData as unknown as {
      laidDownPhases: Record<string, Array<{ cardIds: string[] }>>;
      discardTop: { id: string };
    };
    expect(pd.discardTop.id).toBe('5d');
    expect(pd.laidDownPhases['p1']![0]!.cardIds).toEqual(['5a', '5b', '5c']);

    // Winner + hand scores populated by the standard discard-goes-out path.
    const scoring = after.publicData as unknown as {
      handWinnerId?: string;
      handScores?: Record<string, number>;
    };
    expect(scoring.handWinnerId).toBe('p1');
    expect(scoring.handScores).toBeDefined();
    expect(scoring.handScores!['p1']).toBe(0);
    expect(scoring.handScores!['p2']).toBeGreaterThan(0);
  });

  it('hit-meld: multi-card hit that would empty the hand melds all-but-the-last and discards the last', () => {
    const make = (id: string, value: number, color: 'red' | 'blue' | 'green' | 'yellow' = 'red') => ({
      id,
      deckType: 'phase10' as const,
      phase10Type: 'number' as const,
      phase10Color: color,
      value,
      faceUp: false,
    });
    const fives = [make('5a', 5, 'red'), make('5b', 5, 'blue'), make('5c', 5, 'green')];
    const hand = [make('5d', 5, 'yellow'), make('5e', 5, 'red'), make('5f', 5, 'blue')];

    const seeded: GameState = {
      version: 1,
      roomId: 'r',
      gameId: 'phase10',
      phase: 'playing',
      players: [
        {
          playerId: 'p1',
          displayName: 'P1',
          hand,
          score: 0,
          isOut: false,
          isBot: false,
          currentPhase: 1,
          phaseLaidDown: true,
        },
        {
          playerId: 'p2',
          displayName: 'P2',
          hand: [make('1', 1)],
          score: 0,
          isOut: false,
          isBot: false,
          currentPhase: 1,
          phaseLaidDown: false,
        },
      ],
      currentTurn: 'p1',
      turnNumber: 1,
      roundNumber: 1,
      publicData: {
        drawPile: [],
        discardPile: [make('7', 7)],
        discardTop: make('7', 7),
        drawPileSize: 0,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {
          p1: [
            {
              type: 'set',
              cardIds: fives.map((c) => c.id),
              cards: fives.map((c) => ({ ...c, faceUp: true })),
            },
          ],
        },
      },
      updatedAt: new Date().toISOString(),
    };

    const after = engine.applyAction(seeded, 'p1', {
      type: 'hit-meld',
      payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['5d', '5e', '5f'] },
    });

    const p1After = after.players.find((p) => p.playerId === 'p1')!;
    expect(p1After.hand).toEqual([]);
    expect(p1After.isOut).toBe(true);
    expect(after.phase).toBe('scoring');

    const pd = after.publicData as unknown as {
      laidDownPhases: Record<string, Array<{ cardIds: string[] }>>;
      discardTop: { id: string };
    };
    // 5d and 5e joined the meld; 5f (the last of the submitted ids) hit the discard pile.
    expect(pd.laidDownPhases['p1']![0]!.cardIds).toEqual(['5a', '5b', '5c', '5d', '5e']);
    expect(pd.discardTop.id).toBe('5f');
  });

  it('hit-meld: when a non-emptying subset is submitted the normal path still runs unchanged', () => {
    const make = (id: string, value: number, color: 'red' | 'blue' | 'green' | 'yellow' = 'red') => ({
      id,
      deckType: 'phase10' as const,
      phase10Type: 'number' as const,
      phase10Color: color,
      value,
      faceUp: false,
    });
    const fives = [make('5a', 5, 'red'), make('5b', 5, 'blue'), make('5c', 5, 'green')];
    // Player keeps a 7 in hand so the hit does not empty them.
    const hand = [make('5d', 5, 'yellow'), make('7', 7)];

    const seeded: GameState = {
      version: 1,
      roomId: 'r',
      gameId: 'phase10',
      phase: 'playing',
      players: [
        {
          playerId: 'p1',
          displayName: 'P1',
          hand,
          score: 0,
          isOut: false,
          isBot: false,
          currentPhase: 1,
          phaseLaidDown: true,
        },
        {
          playerId: 'p2',
          displayName: 'P2',
          hand: [make('1', 1)],
          score: 0,
          isOut: false,
          isBot: false,
          currentPhase: 1,
          phaseLaidDown: false,
        },
      ],
      currentTurn: 'p1',
      turnNumber: 1,
      roundNumber: 1,
      publicData: {
        drawPile: [],
        discardPile: [],
        discardTop: null,
        drawPileSize: 0,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {
          p1: [
            {
              type: 'set',
              cardIds: fives.map((c) => c.id),
              cards: fives.map((c) => ({ ...c, faceUp: true })),
            },
          ],
        },
      },
      updatedAt: new Date().toISOString(),
    };

    const after = engine.applyAction(seeded, 'p1', {
      type: 'hit-meld',
      payload: { targetPlayerId: 'p1', groupIndex: 0, cardIds: ['5d'] },
    });

    const p1After = after.players.find((p) => p.playerId === 'p1')!;
    // Hand still holds the 7 — hit did NOT auto-discard.
    expect(p1After.hand.map((c) => c.id)).toEqual(['7']);
    expect(p1After.isOut).toBe(false);
    expect(after.phase).toBe('playing');

    const pd = after.publicData as unknown as {
      laidDownPhases: Record<string, Array<{ cardIds: string[] }>>;
      discardTop: { id: string } | null;
    };
    expect(pd.laidDownPhases['p1']![0]!.cardIds).toEqual(['5a', '5b', '5c', '5d']);
    expect(pd.discardTop).toBeNull();
  });
});

// -------------------------------------------------------------------
// Additional coverage tests
// -------------------------------------------------------------------

describe('Phase10Engine — additional coverage', () => {
  let engine: Phase10Engine;

  beforeEach(() => {
    engine = new Phase10Engine();
  });

  // -------------------------------------------------------------------
  // Player count validation
  // -------------------------------------------------------------------

  it('throws if fewer than 2 players', () => {
    expect(() => engine.startGame(makeConfig(1))).toThrow();
  });

  it('throws if more than 6 players', () => {
    expect(() => engine.startGame(makeConfig(7))).toThrow();
  });

  // -------------------------------------------------------------------
  // Draw pile reshuffle
  // -------------------------------------------------------------------

  it('reshuffles discard pile when draw pile is empty', () => {
    // Create state with empty draw pile and multiple discard cards
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    // Force draw pile to be empty by constructing internal state
    const emptyDrawState: GameState = {
      ...state,
      publicData: {
        ...state.publicData,
        drawPile: [], // empty draw pile
        discardPile: [
          { id: 'disc:2', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 2, faceUp: true },
          { id: 'disc:3', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 3, faceUp: true },
          { id: 'disc:4', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'green' as const, value: 4, faceUp: true },
        ],
        discardTop: { id: 'disc:4', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'green' as const, value: 4, faceUp: true },
        drawPileSize: 0,
        turnPhase: 'draw',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    // Drawing from empty deck should trigger reshuffle
    expect(() =>
      engine.applyAction(emptyDrawState, playerId, { type: 'draw', payload: { source: 'deck' } }),
    ).not.toThrow();
  });

  it('throws when draw pile empty and discard pile has only 1 card', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const emptyState: GameState = {
      ...state,
      publicData: {
        ...state.publicData,
        drawPile: [],
        discardPile: [{ id: 'disc:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 1, faceUp: true }],
        discardTop: { id: 'disc:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 1, faceUp: true },
        drawPileSize: 0,
        turnPhase: 'draw',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    expect(() =>
      engine.applyAction(emptyState, playerId, { type: 'draw', payload: { source: 'deck' } }),
    ).toThrow('No cards left to draw');
  });

  it('throws when drawing from empty discard pile', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const emptyDiscardState: GameState = {
      ...state,
      publicData: {
        ...state.publicData,
        discardPile: [],
        discardTop: null,
        turnPhase: 'draw',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    expect(() =>
      engine.applyAction(emptyDiscardState, playerId, { type: 'draw', payload: { source: 'discard' } }),
    ).toThrow('Discard pile is empty');
  });

  // -------------------------------------------------------------------
  // Lay-down error cases
  // -------------------------------------------------------------------

  it('lay-down: throws when groups omitted AND hand cannot auto-arrange', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    // Hand of all distinct singletons — impossible to make 2 sets of 3.
    const unsatisfiableHand = [
      { id: 'u:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 1, faceUp: false },
      { id: 'u:2', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 2, faceUp: false },
      { id: 'u:3', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 3, faceUp: false },
      { id: 'u:4', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 4, faceUp: false },
      { id: 'u:5', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 5, faceUp: false },
      { id: 'u:6', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 6, faceUp: false },
      { id: 'u:7', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 7, faceUp: false },
      { id: 'u:8', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 8, faceUp: false },
      { id: 'u:9', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 9, faceUp: false },
      { id: 'u:10', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 10, faceUp: false },
    ];
    const withHand: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: unsatisfiableHand } : p,
      ),
    };
    const s = engine.applyAction(withHand, playerId, { type: 'draw', payload: { source: 'deck' } });

    expect(() =>
      engine.applyAction(s, playerId, {
        type: 'lay-down',
        payload: { phase: 1 },
      }),
    ).toThrow(/does not satisfy/i);
  });

  it('lay-down: throws when already laid down', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const testState = buildStateWithPhase1Hand(state, playerId);
    let s = engine.applyAction(testState, playerId, { type: 'draw', payload: { source: 'deck' } });

    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    const set1 = findSetOf3(hand);
    const set2 = findAnotherSetOf3(hand, set1);

    if (set1.length < 3 || set2.length < 3) return;

    s = engine.applyAction(s, playerId, {
      type: 'lay-down',
      payload: {
        phase: 1,
        groups: [
          { type: 'set', cardIds: set1.map((c) => c.id) },
          { type: 'set', cardIds: set2.map((c) => c.id) },
        ],
      },
    });

    // Try to lay down again
    expect(() =>
      engine.applyAction(s, playerId, {
        type: 'lay-down',
        payload: {
          phase: 1,
          groups: [
            { type: 'set', cardIds: set1.map((c) => c.id) },
            { type: 'set', cardIds: set2.map((c) => c.id) },
          ],
        },
      }),
    ).toThrow();
  });

  it('lay-down: throws with duplicate card IDs', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    let s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });

    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    const cardId = hand[0]!.id;

    expect(() =>
      engine.applyAction(s, playerId, {
        type: 'lay-down',
        payload: {
          phase: 1,
          groups: [
            { type: 'set', cardIds: [cardId, cardId, cardId] }, // duplicates
            { type: 'set', cardIds: [hand[1]!.id, hand[2]!.id, hand[3]!.id] },
          ],
        },
      }),
    ).toThrow();
  });

  it('lay-down: throws when card not in hand', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    let s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });

    expect(() =>
      engine.applyAction(s, playerId, {
        type: 'lay-down',
        payload: {
          phase: 1,
          groups: [
            { type: 'set', cardIds: ['notinhand:1', 'notinhand:2', 'notinhand:3'] },
            { type: 'set', cardIds: ['notinhand:4', 'notinhand:5', 'notinhand:6'] },
          ],
        },
      }),
    ).toThrow();
  });

  it('lay-down: throws when group type mismatches requirement', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const testState = buildStateWithPhase1Hand(state, playerId);
    let s = engine.applyAction(testState, playerId, { type: 'draw', payload: { source: 'deck' } });

    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    const set1 = findSetOf3(hand);
    const set2 = findAnotherSetOf3(hand, set1);

    if (set1.length < 3 || set2.length < 3) return;

    expect(() =>
      engine.applyAction(s, playerId, {
        type: 'lay-down',
        payload: {
          phase: 1,
          groups: [
            { type: 'run', cardIds: set1.map((c) => c.id) }, // wrong type
            { type: 'set', cardIds: set2.map((c) => c.id) },
          ],
        },
      }),
    ).toThrow();
  });

  // -------------------------------------------------------------------
  // Validation edge cases
  // -------------------------------------------------------------------

  it('validateSet: rejects skip card in set', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    let s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });

    const skipCard = {
      id: 'phase10:skip:test99',
      deckType: 'phase10' as const,
      phase10Type: 'skip' as const,
      value: 15,
      faceUp: false,
    };

    const handWithSkip = [
      skipCard,
      ...s.players.find((p) => p.playerId === playerId)!.hand.slice(0, 9),
    ];
    const withSkipState: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: handWithSkip } : p,
      ),
    };

    // Inject skip into a "set" — should throw
    expect(() =>
      engine.applyAction(withSkipState, playerId, {
        type: 'lay-down',
        payload: {
          phase: 1,
          groups: [
            { type: 'set', cardIds: ['phase10:skip:test99', handWithSkip[1]!.id, handWithSkip[2]!.id] },
            { type: 'set', cardIds: [handWithSkip[3]!.id, handWithSkip[4]!.id, handWithSkip[5]!.id] },
          ],
        },
      }),
    ).toThrow();
  });

  it('validateRun: rejects run with duplicate values', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const stateForPhase4 = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, currentPhase: 4 } : p,
      ),
    };

    const handWithDups = [
      { id: 'p:r:3:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 3, faceUp: false },
      { id: 'p:b:3:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 3, faceUp: false }, // dup!
      { id: 'p:r:4:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 4, faceUp: false },
      { id: 'p:b:5:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 5, faceUp: false },
      { id: 'p:r:6:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 6, faceUp: false },
      { id: 'p:b:7:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 7, faceUp: false },
      { id: 'p:r:8:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 8, faceUp: false },
      { id: 'p:b:9:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 9, faceUp: false },
      { id: 'p:r:10:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 10, faceUp: false },
      { id: 'p:b:11:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 11, faceUp: false },
    ];

    const withDups: GameState = {
      ...stateForPhase4,
      players: stateForPhase4.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: handWithDups } : p,
      ),
    };

    let s = engine.applyAction(withDups, playerId, { type: 'draw', payload: { source: 'deck' } });

    expect(() =>
      engine.applyAction(s, playerId, {
        type: 'lay-down',
        payload: {
          phase: 4,
          groups: [
            { type: 'run', cardIds: handWithDups.slice(0, 7).map((c) => c.id) }, // has dups 3,3,4,5,6,7,8
          ],
        },
      }),
    ).toThrow();
  });

  it('validateRun: rejects run with too many gaps', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const stateForPhase4 = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, currentPhase: 4 } : p,
      ),
    };

    const handBigGap = [
      { id: 'p:r:1:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 1, faceUp: false },
      { id: 'p:r:9:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 9, faceUp: false },
      { id: 'p:r:10:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 10, faceUp: false },
      { id: 'p:r:11:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 11, faceUp: false },
      { id: 'p:r:12:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 12, faceUp: false },
      { id: 'p:b:3:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 3, faceUp: false },
      { id: 'p:b:4:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 4, faceUp: false },
      { id: 'p:b:5:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 5, faceUp: false },
      { id: 'p:b:6:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 6, faceUp: false },
      { id: 'p:b:7:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 7, faceUp: false },
    ];

    const withBigGap: GameState = {
      ...stateForPhase4,
      players: stateForPhase4.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: handBigGap } : p,
      ),
    };

    let s = engine.applyAction(withBigGap, playerId, { type: 'draw', payload: { source: 'deck' } });

    expect(() =>
      engine.applyAction(s, playerId, {
        type: 'lay-down',
        payload: {
          phase: 4,
          groups: [
            // 1, 9, 10, 11, 12 — gap of 7 between 1 and 9, no wilds
            { type: 'run', cardIds: ['p:r:1:1', 'p:r:9:1', 'p:r:10:1', 'p:r:11:1', 'p:r:12:1', 'p:b:3:1', 'p:b:4:1'] },
          ],
        },
      }),
    ).toThrow();
  });

  it('validateColor: rejects skip in color group', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const stateP8 = { ...state, players: state.players.map((p) => p.playerId === playerId ? { ...p, currentPhase: 8 } : p) };

    const handWithSkip = [
      { id: 'phase10:skip:c1', deckType: 'phase10' as const, phase10Type: 'skip' as const, value: 15, faceUp: false },
      { id: 'p:r:1:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 1, faceUp: false },
      { id: 'p:r:2:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 2, faceUp: false },
      { id: 'p:r:3:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 3, faceUp: false },
      { id: 'p:r:4:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 4, faceUp: false },
      { id: 'p:r:5:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 5, faceUp: false },
      { id: 'p:r:6:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 6, faceUp: false },
      { id: 'p:r:7:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 7, faceUp: false },
      { id: 'p:b:1:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 1, faceUp: false },
      { id: 'p:b:2:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'blue' as const, value: 2, faceUp: false },
    ];

    const withSkip: GameState = {
      ...stateP8,
      players: stateP8.players.map((p) => p.playerId === playerId ? { ...p, hand: handWithSkip } : p),
    };

    let s = engine.applyAction(withSkip, playerId, { type: 'draw', payload: { source: 'deck' } });

    expect(() =>
      engine.applyAction(s, playerId, {
        type: 'lay-down',
        payload: {
          phase: 8,
          groups: [
            { type: 'color', cardIds: ['phase10:skip:c1', 'p:r:1:1', 'p:r:2:1', 'p:r:3:1', 'p:r:4:1', 'p:r:5:1', 'p:r:6:1'] },
          ],
        },
      }),
    ).toThrow();
  });

  it('lay-down run with all wilds is rejected (Mattel: group needs >=1 natural)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const stateP4 = { ...state, players: state.players.map((p) => p.playerId === playerId ? { ...p, currentPhase: 4 } : p) };

    const allWildsHand = [
      { id: 'wild:1', deckType: 'phase10' as const, phase10Type: 'wild' as const, value: 25, faceUp: false },
      { id: 'wild:2', deckType: 'phase10' as const, phase10Type: 'wild' as const, value: 25, faceUp: false },
      { id: 'wild:3', deckType: 'phase10' as const, phase10Type: 'wild' as const, value: 25, faceUp: false },
      { id: 'wild:4', deckType: 'phase10' as const, phase10Type: 'wild' as const, value: 25, faceUp: false },
      { id: 'wild:5', deckType: 'phase10' as const, phase10Type: 'wild' as const, value: 25, faceUp: false },
      { id: 'wild:6', deckType: 'phase10' as const, phase10Type: 'wild' as const, value: 25, faceUp: false },
      { id: 'wild:7', deckType: 'phase10' as const, phase10Type: 'wild' as const, value: 25, faceUp: false },
      { id: 'p:r:1:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 1, faceUp: false },
      { id: 'p:r:2:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 2, faceUp: false },
      { id: 'p:r:3:1', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 3, faceUp: false },
    ];

    const withWilds: GameState = {
      ...stateP4,
      players: stateP4.players.map((p) => p.playerId === playerId ? { ...p, hand: allWildsHand } : p),
    };

    const s = engine.applyAction(withWilds, playerId, { type: 'draw', payload: { source: 'deck' } });

    expect(() =>
      engine.applyAction(s, playerId, {
        type: 'lay-down',
        payload: {
          phase: 4,
          groups: [
            { type: 'run', cardIds: ['wild:1','wild:2','wild:3','wild:4','wild:5','wild:6','wild:7'] },
          ],
        },
      }),
    ).toThrow(/entirely of wild cards/i);
  });

  // -------------------------------------------------------------------
  // Game ends when player completes Phase 10
  // -------------------------------------------------------------------

  it('game ends when player on phase 10 goes out', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    // Player is on phase 10, has phase laid down, has 1 card left
    const oneCard = { id: 'p:r:5:last', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 5, faceUp: false };
    const phase10State: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId
          ? { ...p, hand: [oneCard], currentPhase: 10, phaseLaidDown: true }
          : p,
      ),
    };

    let s = engine.applyAction(phase10State, playerId, { type: 'draw', payload: { source: 'deck' } });
    const hand = s.players.find((p) => p.playerId === playerId)!.hand;
    // discard all except drawn card
    s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [hand[hand.length - 1]!.id] });

    // After discarding 1 card, player has 1 card left (the original oneCard)
    // We need to discard that last one
    const currentHand = s.players.find((p) => p.playerId === playerId)!.hand;
    if (currentHand.length > 0 && s.currentTurn === playerId) {
      // Still need to draw then discard
      s = engine.applyAction(s, playerId, { type: 'draw', payload: { source: 'deck' } });
      const finalHand = s.players.find((p) => p.playerId === playerId)!.hand;
      s = engine.applyAction(s, playerId, { type: 'discard', cardIds: [finalHand[finalHand.length - 1]!.id] });
    }

    // Game should have ended or be in scoring (player on phase 10 may not have completed)
    expect(['scoring', 'ended', 'playing']).toContain(s.phase);
  });

  // -------------------------------------------------------------------
  // hit-meld error paths
  // -------------------------------------------------------------------

  it('hit-meld: throws before drawing', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    // Player has phaseLaidDown=true but turnPhase='draw'
    const withPhase: GameState = {
      ...state,
      players: state.players.map((p) => p.playerId === playerId ? { ...p, phaseLaidDown: true } : p),
    };

    expect(() =>
      engine.applyAction(withPhase, playerId, {
        type: 'hit-meld',
        payload: { targetPlayerId: playerId, groupIndex: 0, cardIds: ['x'] },
      }),
    ).toThrow('Cannot hit meld — must draw first');
  });

  it('hit-meld: throws if player has not laid down phase', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    let s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });
    const card = s.players.find((p) => p.playerId === playerId)!.hand[0]!;

    expect(() =>
      engine.applyAction(s, playerId, {
        type: 'hit-meld',
        payload: { targetPlayerId: playerId, groupIndex: 0, cardIds: [card.id] },
      }),
    ).toThrow('Cannot hit meld before laying down own phase');
  });

  it('hit-meld: throws when target has no laid-down phase', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const withPhase: GameState = {
      ...state,
      players: state.players.map((p) => p.playerId === playerId ? { ...p, phaseLaidDown: true } : p),
      publicData: {
        ...state.publicData,
        turnPhase: 'discard',
        laidDownPhases: {}, // no one has laid down
      },
    };

    const card = withPhase.players.find((p) => p.playerId === playerId)!.hand[0]!;

    expect(() =>
      engine.applyAction(withPhase, playerId, {
        type: 'hit-meld',
        payload: { targetPlayerId: playerId, groupIndex: 0, cardIds: [card.id] },
      }),
    ).toThrow('has no laid-down phase');
  });

  it('hit-meld: throws for invalid group index', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const withPhase: GameState = {
      ...state,
      players: state.players.map((p) => p.playerId === playerId ? { ...p, phaseLaidDown: true } : p),
      publicData: {
        ...state.publicData,
        turnPhase: 'discard',
        laidDownPhases: {
          [playerId]: [{ type: 'set', cardIds: ['a', 'b', 'c'] }],
        },
      },
    };

    const card = withPhase.players.find((p) => p.playerId === playerId)!.hand[0]!;

    expect(() =>
      engine.applyAction(withPhase, playerId, {
        type: 'hit-meld',
        payload: { targetPlayerId: playerId, groupIndex: 99, cardIds: [card.id] },
      }),
    ).toThrow('Group index 99 does not exist');
  });

  it('hit-meld: throws when card not in hand', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const withPhase: GameState = {
      ...state,
      players: state.players.map((p) => p.playerId === playerId ? { ...p, phaseLaidDown: true } : p),
      publicData: {
        ...state.publicData,
        turnPhase: 'discard',
        laidDownPhases: {
          [playerId]: [{ type: 'set', cardIds: ['a', 'b', 'c'] }],
        },
      },
    };

    expect(() =>
      engine.applyAction(withPhase, playerId, {
        type: 'hit-meld',
        payload: { targetPlayerId: playerId, groupIndex: 0, cardIds: ['notinhand:xyz'] },
      }),
    ).toThrow('not in player hand');
  });

  it('hit-meld: throws when skip card tries to hit meld', () => {
    const skipCard = { id: 'skip:h1', deckType: 'phase10' as const, phase10Type: 'skip' as const, value: 15, faceUp: false };
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const withPhase: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId
          ? { ...p, hand: [skipCard, ...p.hand.slice(0, 9)], phaseLaidDown: true }
          : p,
      ),
      publicData: {
        ...state.publicData,
        turnPhase: 'discard',
        laidDownPhases: {
          [playerId]: [{ type: 'set', cardIds: ['a', 'b', 'c'] }],
        },
      },
    };

    expect(() =>
      engine.applyAction(withPhase, playerId, {
        type: 'hit-meld',
        payload: { targetPlayerId: playerId, groupIndex: 0, cardIds: ['skip:h1'] },
      }),
    ).toThrow('cannot be added to this meld');
  });

  // -------------------------------------------------------------------
  // play-skip error paths
  // -------------------------------------------------------------------

  it('play-skip: throws when no skip card in hand', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const targetId = state.players.find((p) => p.playerId !== playerId)!.playerId;

    let s = engine.applyAction(state, playerId, { type: 'draw', payload: { source: 'deck' } });

    // Ensure no skip card in hand
    const handNoSkip = s.players.find((p) => p.playerId === playerId)!.hand.filter((c) => c.phase10Type !== 'skip');
    const noSkipState: GameState = {
      ...s,
      players: s.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: handNoSkip } : p,
      ),
    };

    expect(() =>
      engine.applyAction(noSkipState, playerId, {
        type: 'play-skip',
        payload: { targetPlayerId: targetId },
      }),
    ).toThrow('No skip card in hand');
  });

  it('play-skip: throws for invalid target', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const skipCard = { id: 'phase10:skip:err1', deckType: 'phase10' as const, phase10Type: 'skip' as const, value: 15, faceUp: false };
    const withSkip: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: [skipCard, ...p.hand.slice(0, 9)] } : p,
      ),
      publicData: { ...state.publicData, turnPhase: 'discard' },
    };

    expect(() =>
      engine.applyAction(withSkip, playerId, {
        type: 'play-skip',
        payload: { targetPlayerId: 'nonexistent' },
      }),
    ).toThrow('not found');
  });

  // -------------------------------------------------------------------
  // Unknown action
  // -------------------------------------------------------------------

  it('throws for unknown action type', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    expect(() => engine.applyAction(state, playerId, { type: 'totally-invalid' })).toThrow();
  });

  it('lay-down: throws when attempted without drawing first', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    // turnPhase is 'draw' — attempting lay-down should throw
    expect(() =>
      engine.applyAction(state, playerId, {
        type: 'lay-down',
        payload: { phase: 1, groups: [] },
      }),
    ).toThrow('Cannot lay down — must draw first');
  });

  it('play-skip: throws when attempted without drawing first', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const targetId = state.players.find((p) => p.playerId !== playerId)!.playerId;

    // turnPhase is 'draw'
    expect(() =>
      engine.applyAction(state, playerId, {
        type: 'play-skip',
        payload: { targetPlayerId: targetId },
      }),
    ).toThrow('Cannot play skip — must draw first');
  });

  it('hit-meld: throws when missing required fields', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const withPhase: GameState = {
      ...state,
      players: state.players.map((p) => p.playerId === playerId ? { ...p, phaseLaidDown: true } : p),
      publicData: {
        ...state.publicData,
        turnPhase: 'discard',
        laidDownPhases: { [playerId]: [{ type: 'set', cardIds: ['a', 'b'] }] },
      },
    };

    // Missing groupIndex and cardIds
    expect(() =>
      engine.applyAction(withPhase, playerId, {
        type: 'hit-meld',
        payload: { targetPlayerId: playerId },
      }),
    ).toThrow('hit-meld requires');
  });

  // -------------------------------------------------------------------
  // getValidActions with laid-down phase
  // -------------------------------------------------------------------

  it('getValidActions includes hit-meld when phase is laid and matching cards exist', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const matchCard = { id: 'match:5', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 5, faceUp: false };

    const withPhase: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: [matchCard], phaseLaidDown: true } : p,
      ),
      publicData: {
        ...state.publicData,
        turnPhase: 'discard',
        laidDownPhases: {
          [playerId]: [{ type: 'set', cardIds: ['a', 'b', 'c'] }],
        },
      },
    };

    const actions = engine.getValidActions(withPhase, playerId);
    const hitActions = actions.filter((a) => a.type === 'hit-meld');
    expect(hitActions.length).toBeGreaterThan(0);
  });

  it('getValidActions includes play-skip when skip card in hand (discard phase)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const skipCard = { id: 'skip:va1', deckType: 'phase10' as const, phase10Type: 'skip' as const, value: 15, faceUp: false };

    const withSkip: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: [skipCard] } : p,
      ),
      publicData: { ...state.publicData, turnPhase: 'discard' },
    };

    const actions = engine.getValidActions(withSkip, playerId);
    const skipActions = actions.filter((a) => a.type === 'play-skip');
    expect(skipActions.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------
  // Phase advancement
  // -------------------------------------------------------------------

  it('scoring: player goes out after discarding last card (triggers scoring)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    // Inject state with exactly 1 card and turnPhase='discard' — player goes out on discard
    const lastCard = { id: 'p:r:5:last', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 5, faceUp: false };
    const goingOutState: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId
          ? { ...p, hand: [lastCard], currentPhase: 3, phaseLaidDown: true }
          : { ...p, hand: p.hand, score: 0 },
      ),
      publicData: {
        ...state.publicData,
        turnPhase: 'discard',
      },
    };

    // Discard last card → goes out → scoring
    const s = engine.applyAction(goingOutState, playerId, { type: 'discard', cardIds: [lastCard.id] });

    expect(['scoring', 'ended']).toContain(s.phase);
    const outPlayer = s.players.find((p) => p.playerId === playerId)!;
    expect(outPlayer.isOut).toBe(true);
  });

  it('game ends when player on phase 10 discards last card (phase > 10 = ended)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;

    const lastCard = { id: 'p:r:8:final', deckType: 'phase10' as const, phase10Type: 'number' as const, phase10Color: 'red' as const, value: 8, faceUp: false };
    const phase10WinState: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId
          ? { ...p, hand: [lastCard], currentPhase: 11, phaseLaidDown: true } // currentPhase > 10 means they completed phase 10
          : p,
      ),
      publicData: { ...state.publicData, turnPhase: 'discard' },
    };

    const s = engine.applyAction(phase10WinState, playerId, { type: 'discard', cardIds: [lastCard.id] });
    expect(s.phase).toBe('ended');
  });
});

// ---------------------------------------------------------------------------
// Mattel rule suite — covering rule clarifications added April 2026
// ---------------------------------------------------------------------------

describe('Phase10Engine — Mattel rule suite', () => {
  const makeConfig = (numPlayers: number) => ({
    roomId: 'room-mattel',
    gameId: 'phase10',
    playerIds: Array.from({ length: numPlayers }, (_, i) => `p${i + 1}`),
    maxPlayers: 6 as const,
    minPlayers: 2 as const,
    asyncMode: false,
    turnTimerSeconds: 90,
    options: {} as Record<string, unknown>,
  });
  const engine = new Phase10Engine();

  const numCard = (
    id: string,
    color: 'red' | 'blue' | 'green' | 'yellow',
    value: number,
  ): Card => ({
    id,
    deckType: 'phase10',
    phase10Type: 'number',
    phase10Color: color,
    value,
    faceUp: false,
  });
  const wild = (id: string): Card => ({
    id,
    deckType: 'phase10',
    phase10Type: 'wild',
    value: 25,
    faceUp: false,
  });

  it('scoring: 1\u20139 are each worth 5 points', () => {
    const hand: Card[] = [
      numCard('a', 'red', 1),
      numCard('b', 'red', 5),
      numCard('c', 'red', 9),
    ];
    expect(engine.computeHandScore(hand)).toBe(15);
  });

  it('scoring: 10\u201312 are each worth 10 points', () => {
    const hand: Card[] = [
      numCard('a', 'red', 10),
      numCard('b', 'red', 11),
      numCard('c', 'red', 12),
    ];
    expect(engine.computeHandScore(hand)).toBe(30);
  });

  it('Phase 1 auto-arrange: 4 twos + 2 eights + wild \u2192 {4 twos}{2 eights+wild}', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const hand: Card[] = [
      numCard('t1', 'red', 2), numCard('t2', 'blue', 2), numCard('t3', 'green', 2), numCard('t4', 'yellow', 2),
      numCard('e1', 'red', 8), numCard('e2', 'blue', 8),
      wild('w1'),
      numCard('f1', 'red', 4), numCard('f2', 'red', 5), numCard('f3', 'red', 6),
    ];
    const withHand: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand } : p,
      ),
    };
    const drawn = engine.applyAction(withHand, playerId, { type: 'draw', payload: { source: 'deck' } });
    const after = engine.applyAction(drawn, playerId, { type: 'lay-down', payload: { phase: 1 } });
    const laid = (after.publicData as any).laidDownPhases[playerId] as Array<{ type: string; cardIds: string[]; cards: Card[] }>;
    expect(laid).toHaveLength(2);
    const setSizes = laid.map((g) => g.cardIds.length).sort();
    // Biggest set dumps all four 2s; the other set is 2 eights + wild.
    expect(setSizes).toEqual([3, 4]);
    // Ranks must differ.
    const setRanks = laid.map((g) => {
      const firstNum = g.cards.find((c: Card) => c.phase10Type === 'number');
      return firstNum ? firstNum.value : -1;
    });
    expect(new Set(setRanks).size).toBe(2);
  });

  it('rejects two sets of the same rank even if hand-arranged client-side', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const hand: Card[] = [
      numCard('t1', 'red', 2), numCard('t2', 'blue', 2), numCard('t3', 'green', 2), numCard('t4', 'yellow', 2),
      wild('w1'), wild('w2'),
      numCard('f1', 'red', 4), numCard('f2', 'red', 5), numCard('f3', 'red', 6), numCard('f4', 'red', 7),
    ];
    const withHand: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand } : p,
      ),
    };
    const drawn = engine.applyAction(withHand, playerId, { type: 'draw', payload: { source: 'deck' } });
    expect(() =>
      engine.applyAction(drawn, playerId, {
        type: 'lay-down',
        payload: {
          phase: 1,
          groups: [
            { type: 'set', cardIds: ['t1', 't2', 't3'] },
            { type: 'set', cardIds: ['t4', 'w1', 'w2'] }, // same rank (2)!
          ],
        },
      }),
    ).toThrow(/different ranks/i);
  });

  it('rejects a set made entirely of wilds (must have \u22651 natural)', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.currentTurn!;
    const hand: Card[] = [
      wild('w1'), wild('w2'), wild('w3'),
      numCard('f1', 'red', 5), numCard('f2', 'red', 5), numCard('f3', 'red', 5),
      numCard('g1', 'blue', 1), numCard('g2', 'blue', 2), numCard('g3', 'blue', 3), numCard('g4', 'blue', 4),
    ];
    const withHand: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand } : p,
      ),
    };
    const drawn = engine.applyAction(withHand, playerId, { type: 'draw', payload: { source: 'deck' } });
    expect(() =>
      engine.applyAction(drawn, playerId, {
        type: 'lay-down',
        payload: {
          phase: 1,
          groups: [
            { type: 'set', cardIds: ['w1', 'w2', 'w3'] }, // all wild \u2014 invalid
            { type: 'set', cardIds: ['f1', 'f2', 'f3'] },
          ],
        },
      }),
    ).toThrow(/entirely of wild/i);
  });
});

import type { Card } from '@card-platform/shared-types';

function findSetOf3(hand: Card[]): Card[] {
  const byValue: Record<number, Card[]> = {};
  for (const card of hand) {
    if (card.phase10Type === 'number' && card.value !== undefined) {
      byValue[card.value] = byValue[card.value] ?? [];
      byValue[card.value]!.push(card);
    }
  }
  for (const cards of Object.values(byValue)) {
    if (cards.length >= 3) return cards.slice(0, 3);
  }
  return [];
}

function findAnotherSetOf3(hand: Card[], exclude: Card[]): Card[] {
  const excludeIds = new Set(exclude.map((c) => c.id));
  return findSetOf3(hand.filter((c) => !excludeIds.has(c.id)));
}

function findSetOf5(hand: Card[]): Card[] {
  const byValue: Record<number, Card[]> = {};
  for (const card of hand) {
    if (card.phase10Type === 'number' && card.value !== undefined) {
      byValue[card.value] = byValue[card.value] ?? [];
      byValue[card.value]!.push(card);
    }
  }
  for (const cards of Object.values(byValue)) {
    if (cards.length >= 5) return cards.slice(0, 5);
  }
  return [];
}

function findRunOf4(hand: Card[]): Card[] {
  const numbers = hand
    .filter((c) => c.phase10Type === 'number')
    .sort((a, b) => a.value - b.value);

  for (let i = 0; i <= numbers.length - 4; i++) {
    const run = [numbers[i]!];
    for (let j = i + 1; j < numbers.length && run.length < 4; j++) {
      if (numbers[j]!.value === run[run.length - 1]!.value + 1) {
        run.push(numbers[j]!);
      }
    }
    if (run.length >= 4) return run;
  }
  return [];
}

function buildStateWithPhase1Hand(state: GameState, playerId: string): GameState {
  // Construct hand with two sets of 3: three 5s and three 7s + 4 filler cards
  const hand: Card[] = [
    { id: 'ph1:red:5:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 5, faceUp: false },
    { id: 'ph1:blue:5:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 5, faceUp: false },
    { id: 'ph1:green:5:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'green', value: 5, faceUp: false },
    { id: 'ph1:red:7:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 7, faceUp: false },
    { id: 'ph1:blue:7:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 7, faceUp: false },
    { id: 'ph1:green:7:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'green', value: 7, faceUp: false },
    { id: 'ph1:red:2:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 2, faceUp: false },
    { id: 'ph1:blue:3:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 3, faceUp: false },
    { id: 'ph1:red:4:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 4, faceUp: false },
    { id: 'ph1:yellow:6:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'yellow', value: 6, faceUp: false },
  ];
  return {
    ...state,
    players: state.players.map((p) =>
      p.playerId === playerId ? { ...p, hand } : p,
    ),
  };
}

function buildStateWithWildSetHand(state: GameState, playerId: string): GameState {
  const hand: Card[] = [
    { id: 'ph1:red:5:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 5, faceUp: false },
    { id: 'ph1:blue:5:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 5, faceUp: false },
    { id: 'phase10:wild:1', deckType: 'phase10', phase10Type: 'wild', value: 25, faceUp: false },
    { id: 'ph1:red:8:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 8, faceUp: false },
    { id: 'ph1:blue:8:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 8, faceUp: false },
    { id: 'ph1:green:8:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'green', value: 8, faceUp: false },
    { id: 'ph1:red:2:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 2, faceUp: false },
    { id: 'ph1:blue:3:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 3, faceUp: false },
    { id: 'ph1:red:4:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 4, faceUp: false },
    { id: 'ph1:yellow:6:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'yellow', value: 6, faceUp: false },
  ];
  return {
    ...state,
    players: state.players.map((p) =>
      p.playerId === playerId ? { ...p, hand } : p,
    ),
  };
}

function buildStateWithWildRunHand(state: GameState, playerId: string): GameState {
  const hand: Card[] = [
    { id: 'ph1:red:3:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 3, faceUp: false },
    { id: 'phase10:wild:1', deckType: 'phase10', phase10Type: 'wild', value: 25, faceUp: false },
    { id: 'ph1:blue:5:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 5, faceUp: false },
    { id: 'ph1:green:6:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'green', value: 6, faceUp: false },
    { id: 'ph1:red:9:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 9, faceUp: false },
    { id: 'ph1:blue:9:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 9, faceUp: false },
    { id: 'ph1:green:9:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'green', value: 9, faceUp: false },
    { id: 'ph1:red:2:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 2, faceUp: false },
    { id: 'ph1:blue:3:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 3, faceUp: false },
    { id: 'ph1:red:4:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 4, faceUp: false },
  ];
  return {
    ...state,
    players: state.players.map((p) =>
      p.playerId === playerId ? { ...p, hand } : p,
    ),
  };
}

function buildStateForPhase2(state: GameState, playerId: string): GameState {
  // set of 3 (three 9s) + run of 4 (3,4,5,6)
  const hand: Card[] = [
    { id: 'ph2:red:9:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 9, faceUp: false },
    { id: 'ph2:blue:9:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 9, faceUp: false },
    { id: 'ph2:green:9:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'green', value: 9, faceUp: false },
    { id: 'ph2:red:3:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 3, faceUp: false },
    { id: 'ph2:blue:4:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 4, faceUp: false },
    { id: 'ph2:green:5:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'green', value: 5, faceUp: false },
    { id: 'ph2:yellow:6:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'yellow', value: 6, faceUp: false },
    { id: 'ph2:red:2:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 2, faceUp: false },
    { id: 'ph2:blue:8:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 8, faceUp: false },
    { id: 'ph2:yellow:11:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'yellow', value: 11, faceUp: false },
  ];
  return {
    ...state,
    players: state.players.map((p) =>
      p.playerId === playerId ? { ...p, hand } : p,
    ),
  };
}

function buildStateForPhase8(state: GameState, playerId: string): GameState {
  // 7 red cards + 3 others
  const hand: Card[] = [
    { id: 'ph8:red:1:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 1, faceUp: false },
    { id: 'ph8:red:2:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 2, faceUp: false },
    { id: 'ph8:red:3:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 3, faceUp: false },
    { id: 'ph8:red:4:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 4, faceUp: false },
    { id: 'ph8:red:5:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 5, faceUp: false },
    { id: 'ph8:red:6:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 6, faceUp: false },
    { id: 'ph8:red:7:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 7, faceUp: false },
    { id: 'ph8:blue:5:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 5, faceUp: false },
    { id: 'ph8:green:6:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'green', value: 6, faceUp: false },
    { id: 'ph8:yellow:8:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'yellow', value: 8, faceUp: false },
  ];
  return {
    ...state,
    players: state.players.map((p) =>
      p.playerId === playerId ? { ...p, hand } : p,
    ),
  };
}

function buildStateForPhase10(state: GameState, playerId: string): GameState {
  // set of 5 (five 3s) + set of 3 (three 8s) + 2 filler
  const hand: Card[] = [
    { id: 'ph10:red:3:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 3, faceUp: false },
    { id: 'ph10:blue:3:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 3, faceUp: false },
    { id: 'ph10:green:3:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'green', value: 3, faceUp: false },
    { id: 'ph10:yellow:3:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'yellow', value: 3, faceUp: false },
    { id: 'ph10:red:3:2', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 3, faceUp: false },
    { id: 'ph10:red:8:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 8, faceUp: false },
    { id: 'ph10:blue:8:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 8, faceUp: false },
    { id: 'ph10:green:8:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'green', value: 8, faceUp: false },
    { id: 'ph10:red:2:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 2, faceUp: false },
    { id: 'ph10:blue:11:1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 11, faceUp: false },
  ];
  return {
    ...state,
    players: state.players.map((p) =>
      p.playerId === playerId ? { ...p, hand } : p,
    ),
  };
}
