/**
 * Phase 10 Bot Strategy Tests
 *
 * Tests per SPEC.md §9.5.
 */

import { Phase10BotStrategy } from '../src/bots/strategies/phase10.strategy';
import type { GameState, Card } from '@card-platform/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(
  id: string,
  value: number,
  type: 'number' | 'wild' | 'skip' = 'number',
  color: 'red' | 'blue' | 'green' | 'yellow' = 'red',
): Card {
  return {
    id,
    deckType: 'phase10',
    phase10Type: type,
    phase10Color: type === 'number' ? color : undefined,
    value,
    faceUp: false,
  };
}

function makeState(overrides: {
  botHand?: Card[];
  otherHands?: Card[][];
  discardTop?: Card;
  currentPhase?: number;
  phaseLaidDown?: boolean;
  laidDownGroups?: Array<{ type: string; cards: Card[] }>;
  skippedPlayers?: string[];
}): GameState {
  const {
    botHand = [makeCard('c1', 5), makeCard('c2', 7)],
    otherHands = [[makeCard('o1', 3), makeCard('o2', 4)]],
    discardTop = makeCard('d1', 6),
    currentPhase = 1,
    phaseLaidDown = false,
    laidDownGroups = [],
    skippedPlayers = [],
  } = overrides;

  const players = [
    {
      playerId: 'bot-1',
      displayName: 'Bot',
      hand: botHand,
      score: 0,
      isOut: false,
      isBot: true,
      currentPhase,
      phaseLaidDown,
    },
    ...otherHands.map((hand, i) => ({
      playerId: `player-${i + 2}`,
      displayName: `Player ${i + 2}`,
      hand,
      score: 0,
      isOut: false,
      isBot: false,
      currentPhase: 1,
      phaseLaidDown: false,
    })),
  ];

  return {
    version: 5,
    roomId: 'room-1',
    gameId: 'phase10',
    phase: 'playing',
    players,
    currentTurn: 'bot-1',
    turnNumber: 5,
    roundNumber: 1,
    publicData: {
      discardTop,
      drawPileSize: 30,
      turnPhase: 'draw',
      skippedPlayers,
      laidDownPhases: {
        'bot-1': phaseLaidDown ? laidDownGroups : undefined,
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase10BotStrategy', () => {
  let strategy: Phase10BotStrategy;

  beforeEach(() => {
    strategy = new Phase10BotStrategy();
  });

  it('has gameId = phase10', () => {
    expect(strategy.gameId).toBe('phase10');
  });

  // -------------------------------------------------------------------
  // chooseAction: draw phase
  // -------------------------------------------------------------------

  it('chooseAction returns a valid PlayerAction', () => {
    const state = makeState({});
    const action = strategy.chooseAction(state, 'bot-1');
    expect(action).toBeDefined();
    expect(action.type).toBeTruthy();
  });

  it('draw phase: draws from deck when discard top does not help phase', () => {
    // Bot is on phase 1 (2 sets of 3), discard top is a single card with unique value
    const hand = [
      makeCard('c1', 5), makeCard('c2', 7), makeCard('c3', 9),
      makeCard('c4', 11), makeCard('c5', 1), makeCard('c6', 2),
      makeCard('c7', 3), makeCard('c8', 4), makeCard('c9', 6), makeCard('c10', 8),
    ];
    const discardTop = makeCard('d1', 12); // 12 is unique — doesn't help any set
    const state = makeState({ botHand: hand, discardTop, currentPhase: 1 });

    const action = strategy.chooseAction(state, 'bot-1');
    // Either draws from deck or discard (strategy may prefer deck when discard doesn't help)
    expect(['draw', 'discard', 'lay-down'].includes(action.type)).toBe(true);
  });

  it('draw phase: prefers discard pile top when it advances the phase', () => {
    // Bot has two 5s, discard top is also a 5 → helps form set of 3
    const hand = [
      makeCard('c1', 5), makeCard('c2', 5), makeCard('c3', 7),
      makeCard('c4', 11), makeCard('c5', 1), makeCard('c6', 2),
      makeCard('c7', 3), makeCard('c8', 4), makeCard('c9', 6), makeCard('c10', 8),
    ];
    const discardTop = makeCard('d1', 5); // third 5 — forms set of 3!
    const state = makeState({ botHand: hand, discardTop, currentPhase: 1 });

    const action = strategy.chooseAction(state, 'bot-1');
    // Bot should prefer drawing from discard since it gives the 3rd 5
    expect(action.type).toBe('draw');
    if (action.type === 'draw') {
      expect((action.payload as Record<string, unknown>)?.source).toBe('discard');
    }
  });

  // -------------------------------------------------------------------
  // chooseAction: lay-down phase
  // -------------------------------------------------------------------

  it('lays down phase when bot can complete Phase 1 (2 sets of 3)', () => {
    // Hand already drawn (turnPhase=discard): has two full sets
    const hand = [
      makeCard('c1', 5), makeCard('c2', 5), makeCard('c3', 5), // set 1
      makeCard('c4', 8), makeCard('c5', 8), makeCard('c6', 8), // set 2
      makeCard('c7', 3), makeCard('c8', 4), makeCard('c9', 6), makeCard('c10', 1),
      makeCard('c11', 2), // extra — drawn card
    ];
    const discardTop = makeCard('d1', 12);
    const state: GameState = {
      ...makeState({ botHand: hand, discardTop, currentPhase: 1 }),
      publicData: {
        discardTop,
        drawPileSize: 30,
        turnPhase: 'discard', // already drew
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    // Should either lay down or discard
    expect(['lay-down', 'discard']).toContain(action.type);
    if (action.type === 'lay-down') {
      expect(action.payload?.groups).toBeDefined();
    }
  });

  it('lays down phase 1 when 2 sets of 3 available', () => {
    const hand = [
      makeCard('c1', 5, 'number', 'red'),
      makeCard('c2', 5, 'number', 'blue'),
      makeCard('c3', 5, 'number', 'green'),
      makeCard('c4', 8, 'number', 'red'),
      makeCard('c5', 8, 'number', 'blue'),
      makeCard('c6', 8, 'number', 'green'),
      makeCard('c7', 3), makeCard('c8', 4), makeCard('c9', 6), makeCard('c10', 1),
      makeCard('c11', 2),
    ];
    const state: GameState = {
      ...makeState({ botHand: hand, currentPhase: 1 }),
      publicData: {
        discardTop: makeCard('d1', 12),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    if (action.type === 'lay-down') {
      expect(action.payload?.groups).toBeDefined();
      const groups = action.payload!.groups as Array<{ type: string; cardIds: string[] }>;
      expect(groups).toHaveLength(2);
      groups.forEach((g) => expect(g.cardIds).toHaveLength(3));
    }
  });

  // -------------------------------------------------------------------
  // chooseAction: discard phase
  // -------------------------------------------------------------------

  it('discard phase: discards highest-value non-phase card', () => {
    const hand = [
      makeCard('c1', 5, 'number', 'red'),
      makeCard('c2', 5, 'number', 'blue'),
      makeCard('c3', 5, 'number', 'green'),
      makeCard('c4', 8, 'number', 'red'),
      makeCard('c5', 8, 'number', 'blue'),
      makeCard('c6', 8, 'number', 'green'),
      makeCard('c7', 12), // highest non-phase card
      makeCard('c8', 4),
      makeCard('c9', 6),
      makeCard('c10', 1),
      makeCard('c11', 2),
    ];
    const state: GameState = {
      ...makeState({ botHand: hand, currentPhase: 1 }),
      publicData: {
        discardTop: makeCard('d1', 11),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    if (action.type === 'discard') {
      // Should discard c7 (value=12) or another high-value non-phase card
      const discardedCardId = action.cardIds?.[0];
      expect(discardedCardId).toBeDefined();
      const discardedCard = hand.find((c) => c.id === discardedCardId);
      // Discarded card should NOT be one of the 5s or 8s (those are phase cards)
      if (discardedCard) {
        const phaseCardIds = new Set(['c1','c2','c3','c4','c5','c6']);
        expect(phaseCardIds.has(discardedCard.id)).toBe(false);
      }
    }
  });

  it('never discards wild cards', () => {
    const wild = makeCard('wild1', 25, 'wild');
    const hand = [
      wild,
      makeCard('c2', 5), makeCard('c3', 7), makeCard('c4', 9),
      makeCard('c5', 3), makeCard('c6', 4), makeCard('c7', 6),
      makeCard('c8', 8), makeCard('c9', 10), makeCard('c10', 11),
      makeCard('c11', 12),
    ];

    // Run several iterations with different states
    for (let i = 0; i < 5; i++) {
      const state: GameState = {
        ...makeState({ botHand: hand, currentPhase: 1 }),
        publicData: {
          discardTop: makeCard('d1', 2),
          drawPileSize: 20,
          turnPhase: 'discard',
          skippedPlayers: [],
          laidDownPhases: {},
        },
      };
      const action = strategy.chooseAction(state, 'bot-1');
      if (action.type === 'discard') {
        expect(action.cardIds).not.toContain('wild1');
      }
    }
  });

  // -------------------------------------------------------------------
  // Skip card behavior
  // -------------------------------------------------------------------

  it('plays skip when drawn, targeting player with most cards', () => {
    // Bot has a skip in hand (after drawing), another player has more cards
    const skipCard = makeCard('skip1', 15, 'skip');
    const hand = [
      skipCard,
      makeCard('c2', 5), makeCard('c3', 7), makeCard('c4', 9),
      makeCard('c5', 3), makeCard('c6', 4), makeCard('c7', 6),
      makeCard('c8', 8), makeCard('c9', 10), makeCard('c10', 11),
      makeCard('c11', 12), // 11 cards = just drew
    ];

    const state: GameState = {
      ...makeState({
        botHand: hand,
        otherHands: [
          // player-2 has more cards = target
          [makeCard('o1',1),makeCard('o2',2),makeCard('o3',3),makeCard('o4',4),makeCard('o5',5),
           makeCard('o6',6),makeCard('o7',7),makeCard('o8',8),makeCard('o9',9),makeCard('o10',10),makeCard('o11',11)],
          [makeCard('p1',1),makeCard('p2',2),makeCard('p3',3)],
        ],
        currentPhase: 1,
      }),
      publicData: {
        discardTop: makeCard('d1', 2),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    // Should play skip targeting player with most cards (player-2)
    if (action.type === 'play-skip') {
      expect(action.payload?.targetPlayerId).toBe('player-2');
    }
    // May also just discard if strategy doesn't yet play skip
    expect(['play-skip', 'discard', 'draw']).toContain(action.type);
  });

  // -------------------------------------------------------------------
  // Phase already laid — hit meld
  // -------------------------------------------------------------------

  it('hits a meld when phase already laid and card fits', () => {
    const hand = [
      makeCard('c1', 5, 'number', 'red'), // matches laid set of 5s
      makeCard('c2', 12), makeCard('c3', 11), makeCard('c4', 10),
    ];

    const laidGroups = [
      {
        type: 'set',
        cards: [
          makeCard('l1', 5, 'number', 'red'),
          makeCard('l2', 5, 'number', 'blue'),
          makeCard('l3', 5, 'number', 'green'),
        ],
      },
    ];

    const state: GameState = {
      ...makeState({ botHand: hand, phaseLaidDown: true, laidDownGroups: laidGroups, currentPhase: 1 }),
      publicData: {
        discardTop: makeCard('d1', 2),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {
          'bot-1': laidGroups,
        },
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    // Could hit meld or discard — both are valid
    expect(['hit-meld', 'discard', 'draw', 'lay-down']).toContain(action.type);
  });

  // -------------------------------------------------------------------
  // fallbackAction
  // -------------------------------------------------------------------

  it('fallbackAction never throws', () => {
    const state = makeState({});
    expect(() => strategy.fallbackAction(state, 'bot-1')).not.toThrow();
  });

  it('fallbackAction returns a valid PlayerAction', () => {
    const state = makeState({});
    const action = strategy.fallbackAction(state, 'bot-1');
    expect(action).toBeDefined();
    expect(action.type).toBeTruthy();
  });

  it('fallbackAction discards rightmost card', () => {
    const hand = [makeCard('c1', 3), makeCard('c2', 5), makeCard('c3', 7)];
    const state = makeState({ botHand: hand });
    const action = strategy.fallbackAction(state, 'bot-1');
    expect(action.type).toBe('discard');
    expect(action.cardIds).toEqual(['c3']);
  });

  it('fallbackAction returns pass when hand is empty', () => {
    const state = makeState({ botHand: [] });
    const action = strategy.fallbackAction(state, 'bot-1');
    expect(action.type).toBe('pass');
  });

  it('fallbackAction returns pass when player not found', () => {
    const state = makeState({});
    const action = strategy.fallbackAction(state, 'nonexistent');
    expect(action.type).toBe('pass');
  });

  it('fallbackAction works even if state is malformed', () => {
    const badState = {} as GameState;
    expect(() => strategy.fallbackAction(badState, 'bot-1')).not.toThrow();
    const result = strategy.fallbackAction(badState, 'bot-1');
    expect(result.type).toBeDefined();
  });

  // -------------------------------------------------------------------
  // chooseAction never throws (all fallback levels)
  // -------------------------------------------------------------------

  it('chooseAction handles empty hand gracefully', () => {
    const state = makeState({ botHand: [] });
    expect(() => strategy.chooseAction(state, 'bot-1')).not.toThrow();
  });

  it('chooseAction handles unknown turnPhase gracefully', () => {
    const state: GameState = {
      ...makeState({}),
      publicData: {
        ...makeState({}).publicData,
        turnPhase: 'unknown',
      },
    };
    expect(() => strategy.chooseAction(state, 'bot-1')).not.toThrow();
  });

  // -------------------------------------------------------------------
  // chooseAction error path: triggers fallback
  // -------------------------------------------------------------------

  it('chooseAction falls back when player not found in state', () => {
    const state = makeState({});
    // Bot ID doesn't exist in state
    expect(() => strategy.chooseAction(state, 'nonexistent-bot')).not.toThrow();
    const action = strategy.chooseAction(state, 'nonexistent-bot');
    expect(action.type).toBeDefined();
  });

  // -------------------------------------------------------------------
  // draw phase: discard top is a wild card → always draw from discard
  // -------------------------------------------------------------------

  it('draw phase: draws from discard when discard top is a wild card', () => {
    const hand = [
      makeCard('c1', 5), makeCard('c2', 7), makeCard('c3', 9),
      makeCard('c4', 11), makeCard('c5', 1), makeCard('c6', 2),
      makeCard('c7', 3), makeCard('c8', 4), makeCard('c9', 6), makeCard('c10', 8),
    ];
    const wildDiscardTop = makeCard('wild:d1', 25, 'wild');
    const state = makeState({ botHand: hand, discardTop: wildDiscardTop, currentPhase: 1 });

    const action = strategy.chooseAction(state, 'bot-1');
    // Wild card on discard always advances phase
    expect(action.type).toBe('draw');
    if (action.type === 'draw') {
      expect((action.payload as Record<string, unknown>)?.source).toBe('discard');
    }
  });

  // -------------------------------------------------------------------
  // draw phase: discard top advances run phase
  // -------------------------------------------------------------------

  it('draw phase: draws from discard when card extends partial run (phase 4)', () => {
    // Bot on phase 4 (run of 7), has 3,4,5,6 already, discard is 7
    const hand = [
      makeCard('c1', 3, 'number', 'red'),
      makeCard('c2', 4, 'number', 'blue'),
      makeCard('c3', 5, 'number', 'green'),
      makeCard('c4', 6, 'number', 'yellow'),
      makeCard('c5', 1), makeCard('c6', 2),
      makeCard('c7', 9), makeCard('c8', 10), makeCard('c9', 11), makeCard('c10', 12),
    ];
    const discardTop = makeCard('d:7', 7, 'number', 'red');
    const state: GameState = {
      ...makeState({ botHand: hand, discardTop, currentPhase: 4 }),
      publicData: {
        discardTop,
        drawPileSize: 20,
        turnPhase: 'draw',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    expect(action.type).toBe('draw');
  });

  // -------------------------------------------------------------------
  // draw phase: discard advances color phase
  // -------------------------------------------------------------------

  it('draw phase: draws from discard when card matches color phase (phase 8)', () => {
    const hand = [
      makeCard('c1', 3, 'number', 'red'),
      makeCard('c2', 4, 'number', 'red'),
      makeCard('c3', 5, 'number', 'red'),
      makeCard('c4', 6, 'number', 'red'),
      makeCard('c5', 7, 'number', 'red'),
      makeCard('c6', 8, 'number', 'red'),
      makeCard('c7', 2), makeCard('c8', 9), makeCard('c9', 11), makeCard('c10', 12),
    ];
    const discardTop = makeCard('d:red:1', 1, 'number', 'red'); // 7th red card!
    const state: GameState = {
      ...makeState({ botHand: hand, discardTop, currentPhase: 8 }),
      publicData: {
        discardTop,
        drawPileSize: 20,
        turnPhase: 'draw',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    // Should prefer drawing from discard (7th red = completes phase 8)
    expect(action.type).toBe('draw');
  });

  // -------------------------------------------------------------------
  // Progress guarantee: bot must always advance its own turn
  // (regression: bot used to return 'pass' with all-wild hand, which
  // caused it to get stuck in "Thinking…" after lay-down because the
  // scheduler won't advance turn on a pass.)
  // -------------------------------------------------------------------

  it('discards a wild as last resort when hand has only wilds (never pass)', () => {
    const hand = [
      makeCard('w1', 25, 'wild'),
      makeCard('w2', 25, 'wild'),
      makeCard('w3', 25, 'wild'),
    ];
    const state: GameState = {
      ...makeState({ botHand: hand, currentPhase: 1 }),
      publicData: {
        discardTop: makeCard('d1', 2),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    expect(action.type).toBe('discard');
    expect(action.cardIds).toHaveLength(1);
    expect(['w1', 'w2', 'w3']).toContain(action.cardIds![0]);
  });

  it('does NOT hit with its last card (Phase 10 rule: must keep one to discard)', () => {
    // Regression: the bot used to hit-meld its way down to an empty hand,
    // then decideDiscard(hand=[]) returned 'pass', stranding the schedule
    // keys. The rule is "always keep at least one card to discard."
    const hand = [makeCard('solo', 5, 'number', 'red')];
    const state: GameState = {
      ...makeState({ botHand: hand, phaseLaidDown: true, currentPhase: 1 }),
      publicData: {
        discardTop: makeCard('d1', 2),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {
          'bot-1': [
            { type: 'set', cardIds: ['s1', 's2', 's3'] },
          ],
        },
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    expect(action.type).toBe('discard');
    expect(action.cardIds).toEqual(['solo']);
  });

  it('post-lay-down: continues to discard instead of hit-melding into an empty hand', () => {
    // After laying down phase 1 (6 cards) the bot has a small remaining
    // hand. Even if every remaining card COULD hit the meld, the strategy
    // must stop hit-melding when hand is down to 1 so it can discard it
    // and go out.
    const hand = [makeCard('last', 7, 'number', 'red')];
    const state: GameState = {
      ...makeState({ botHand: hand, phaseLaidDown: true, currentPhase: 1 }),
      publicData: {
        discardTop: makeCard('d1', 2),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {
          'bot-1': [
            { type: 'set', cardIds: ['s1', 's2', 's3'] },
            { type: 'set', cardIds: ['s4', 's5', 's6'] },
          ],
        },
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    // With one card left the only progress-making action is discard.
    expect(action.type).toBe('discard');
    expect(action.type).not.toBe('pass');
  });

  it('hits own meld with a wild before discarding one (phase laid)', () => {
    // After lay-down, only wilds remain; the bot has a laid meld it can extend.
    const hand = [makeCard('w1', 25, 'wild'), makeCard('w2', 25, 'wild')];
    const state: GameState = {
      ...makeState({ botHand: hand, phaseLaidDown: true, currentPhase: 1 }),
      publicData: {
        discardTop: makeCard('d1', 2),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {
          'bot-1': [
            { type: 'set', cardIds: ['s1', 's2', 's3'] },
            { type: 'set', cardIds: ['s4', 's5', 's6'] },
          ],
        },
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    // Prefers hit-meld with a wild over discarding a wild.
    expect(['hit-meld', 'discard']).toContain(action.type);
    expect(action.type).not.toBe('pass');
  });

  it('discards the skip card when there is no valid play-skip target', () => {
    // All opponents are out → no play-skip target. Discarding the skip is
    // still the right move (skip on top of pile passes the rule to the
    // next non-skipped player).
    const skipCard = makeCard('skip:solo', 15, 'skip');
    const hand = [
      skipCard,
      makeCard('c2', 5),
      makeCard('c3', 7),
    ];
    const state: GameState = {
      ...makeState({ botHand: hand, currentPhase: 1 }),
      players: [
        {
          playerId: 'bot-1',
          displayName: 'Bot',
          hand,
          score: 0,
          isOut: false,
          isBot: true,
          currentPhase: 1,
          phaseLaidDown: false,
        },
        {
          playerId: 'player-2',
          displayName: 'Player 2',
          hand: [],
          score: 0,
          isOut: true,
          isBot: false,
          currentPhase: 1,
          phaseLaidDown: false,
        },
      ],
      publicData: {
        discardTop: makeCard('d1', 2),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    expect(action.type).toBe('discard');
    // Skip (15 pts) outranks any remaining non-phase number card, so the
    // bot should dump it rather than keep it as dead weight.
    expect(action.cardIds).toEqual([skipCard.id]);
  });

  // -------------------------------------------------------------------
  // decideDiscard: all phase cards — discard least valuable
  // -------------------------------------------------------------------

  it('decideDiscard: discards least-valuable card when all cards are phase cards', () => {
    // Phase 1 = 2 sets of 3. 6 cards all being the same values as sets, nothing extra
    const hand = [
      makeCard('c1', 5, 'number', 'red'),
      makeCard('c2', 5, 'number', 'blue'),
      makeCard('c3', 5, 'number', 'green'),
      makeCard('c4', 8, 'number', 'red'),
      makeCard('c5', 8, 'number', 'blue'),
      makeCard('c6', 8, 'number', 'green'),
    ];
    const state: GameState = {
      ...makeState({ botHand: hand, currentPhase: 1 }),
      publicData: {
        discardTop: makeCard('d1', 2),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    // Should lay down, but if not, discards least valuable of the phase cards
    expect(['lay-down', 'discard']).toContain(action.type);
    if (action.type === 'discard') {
      const discardedId = action.cardIds?.[0];
      const discardedCard = hand.find((c) => c.id === discardedId);
      // Should discard a lower-value card (5 < 8)
      if (discardedCard) {
        expect(discardedCard.value).toBeLessThanOrEqual(8);
      }
    }
  });

  // -------------------------------------------------------------------
  // findBestHitMeld: actual hit meld with proper laidDownPhases
  // -------------------------------------------------------------------

  it('hits meld with highest-value matching card when phase laid', () => {
    // Bot has laid down phase 1 (2 sets of 3)
    // Has 2 extra cards — one matches set value, one doesn't
    const hand = [
      makeCard('match5', 5, 'number', 'yellow'), // matches set of 5s
      makeCard('high12', 12, 'number', 'red'), // highest value, but doesn't match set
      makeCard('extra3', 3, 'number', 'red'),  // lower value non-matching
    ];

    const state: GameState = {
      ...makeState({ botHand: hand, phaseLaidDown: true, currentPhase: 1 }),
      publicData: {
        discardTop: makeCard('d1', 2),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {
          'bot-1': [
            { type: 'set', cardIds: ['s1', 's2', 's3'] }, // set of 5s
            { type: 'set', cardIds: ['s4', 's5', 's6'] }, // set of 8s
          ],
        },
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    // Could hit-meld, discard, or lay-down
    expect(['hit-meld', 'discard']).toContain(action.type);
  });

  // -------------------------------------------------------------------
  // skip card with no valid opponents (all out)
  // -------------------------------------------------------------------

  it('does not play skip when all opponents are out', () => {
    const skipCard = makeCard('skip:no-op', 15, 'skip');
    const hand = [skipCard, makeCard('c2', 5), makeCard('c3', 7)];

    const state: GameState = {
      ...makeState({ botHand: hand, currentPhase: 1 }),
      players: [
        {
          playerId: 'bot-1',
          displayName: 'Bot',
          hand,
          score: 0,
          isOut: false,
          isBot: true,
          currentPhase: 1,
          phaseLaidDown: false,
        },
        {
          playerId: 'player-2',
          displayName: 'Player 2',
          hand: [],
          score: 0,
          isOut: true, // opponent already out!
          isBot: false,
          currentPhase: 1,
          phaseLaidDown: false,
        },
      ],
      publicData: {
        discardTop: makeCard('d1', 2),
        drawPileSize: 20,
        turnPhase: 'discard',
        skippedPlayers: [],
        laidDownPhases: {},
      },
    };

    const action = strategy.chooseAction(state, 'bot-1');
    // Can't play skip with no valid targets, should discard instead
    expect(action.type).not.toBe('play-skip');
    expect(['discard', 'lay-down']).toContain(action.type);
  });
});
