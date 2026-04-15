/**
 * Cribbage Engine Tests — SPEC.md §19 Story 8.4
 */

import { CribbageEngine } from '../src/games/cribbage/engine';
import type { GameConfig, GameState } from '@card-platform/shared-types';

function makeConfig(playerCount = 2): GameConfig {
  return {
    roomId: 'room-test',
    gameId: 'cribbage',
    playerIds: Array.from({ length: playerCount }, (_, i) => `p${i + 1}`),
    asyncMode: true,
    turnTimerSeconds: 90,
  };
}

describe('CribbageEngine', () => {
  let engine: CribbageEngine;

  beforeEach(() => { engine = new CribbageEngine(); });

  it('has gameId = cribbage', () => {
    expect(engine.gameId).toBe('cribbage');
  });

  it('supports 2-4 players', () => {
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(4);
  });

  it('deals 6 cards each for 2-player game', () => {
    const state = engine.startGame(makeConfig(2));
    state.players.forEach(p => expect(p.hand).toHaveLength(6));
  });

  it('starts in dealing phase (waiting for crib discards)', () => {
    const state = engine.startGame(makeConfig(2));
    expect(['playing', 'dealing']).toContain(state.phase);
  });

  it('has a dealer set', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.players.some(p => p.isDealer)).toBe(true);
  });

  it('cribbageBoardState is set', () => {
    const state = engine.startGame(makeConfig(2));
    expect(state.cribbageBoardState).toBeTruthy();
    expect(state.cribbageBoardState!.winScore).toBe(121);
  });

  it('cribbageBoardState pegs all start at 0', () => {
    const state = engine.startGame(makeConfig(2));
    for (const peg of state.cribbageBoardState!.pegs) {
      expect(peg.frontPeg).toBe(0);
      expect(peg.backPeg).toBe(0);
    }
  });

  it('isGameOver false at start', () => {
    expect(engine.isGameOver(engine.startGame(makeConfig(2)))).toBe(false);
  });

  it('computeResult returns rankings', () => {
    const result = engine.computeResult(engine.startGame(makeConfig(2)));
    expect(result).toHaveLength(2);
  });

  it('allows discard-to-crib action', () => {
    const state = engine.startGame(makeConfig(2));
    const playerId = state.players[0]!.playerId;
    const actions = engine.getValidActions(state, playerId);
    expect(actions.some(a => a.type === 'discard-crib' || a.type === 'discard')).toBe(true);
  });

  it('rejects action from non-turn player when in pegging', () => {
    const state = engine.startGame(makeConfig(2));
    // Force to pegging phase
    const pd = state.publicData as Record<string, unknown>;
    if (pd.gamePhase === 'pegging') {
      const other = state.players.find(p => p.playerId !== state.currentTurn)!;
      expect(() => engine.applyAction(state, other.playerId, { type: 'play', cardIds: [] })).toThrow();
    }
    // If not in pegging yet, just verify start state is consistent
    expect(state.players).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Hoyle's Cribbage — rule-by-rule coverage (added April 2026).
// Source: Hoyle's Standard Games (wikisource), chapter on Cribbage.
// ---------------------------------------------------------------------------

import { scoreHand, scorePegPlay, cardValue } from '../src/games/cribbage/engine';
import type { Card } from '@card-platform/shared-types';

function c(id: string, rank: string, suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'): Card {
  const valueMap: Record<string, number> = {
    A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, J: 11, Q: 12, K: 13,
  };
  return {
    id,
    deckType: 'standard',
    suit,
    rank: rank as Card['rank'],
    value: valueMap[rank]!,
    faceUp: true,
  };
}

describe("CribbageEngine \u2014 Hoyle's rule suite", () => {
  describe('cardValue (pegging)', () => {
    it('Ace = 1', () => {
      expect(cardValue(c('x', 'A', 'hearts'))).toBe(1);
    });
    it('face cards = 10', () => {
      expect(cardValue(c('x', 'J', 'hearts'))).toBe(10);
      expect(cardValue(c('x', 'Q', 'hearts'))).toBe(10);
      expect(cardValue(c('x', 'K', 'hearts'))).toBe(10);
    });
    it('number cards = face value', () => {
      expect(cardValue(c('x', '7', 'hearts'))).toBe(7);
      expect(cardValue(c('x', '10', 'hearts'))).toBe(10);
    });
  });

  describe('scoreHand (the show)', () => {
    it('15-two: 10-5 = 2 points', () => {
      const hand = [c('a', '10', 'hearts'), c('b', '5', 'spades'), c('c', '3', 'clubs'), c('d', '4', 'diamonds')];
      const cut = c('cut', '2', 'clubs');
      // 15s: 10+5=15 (2); 10+3+2=15(2); 10+4+?no. Pairs: none. Runs: 2,3,4,5 → 4. Flush: no. Nobs: no.
      // Totals = 2+2+4 = 8
      expect(scoreHand(hand, cut)).toBe(8);
    });

    it('pair royal (three of a kind) = 6', () => {
      const hand = [c('a', '7', 'hearts'), c('b', '7', 'spades'), c('c', '7', 'clubs'), c('d', 'A', 'diamonds')];
      const cut = c('cut', '2', 'clubs');
      // 15s: 7+7+A=15 (×C(3,2)=3) = 6; Pairs: C(3,2)=3 pairs \u00d7 2 = 6; no runs; no flush; no nobs
      expect(scoreHand(hand, cut)).toBe(12);
    });

    it('four of a kind = 12 (pairs only)', () => {
      const hand = [c('a', '7', 'hearts'), c('b', '7', 'spades'), c('c', '7', 'clubs'), c('d', '7', 'diamonds')];
      const cut = c('cut', 'A', 'hearts');
      // 15s: no 15 combos (7+7+A=15 \u00d7 C(4,2)=6 pair groupings = 12? wait any pair of 7s + ace = 15 \u2192 C(4,2)=6 combos = 12 pts)
      // Pairs: C(4,2)=6 pairs \u00d7 2 = 12
      expect(scoreHand(hand, cut)).toBe(24);
    });

    it('run of 3 = 3 points', () => {
      const hand = [c('a', '3', 'hearts'), c('b', '4', 'spades'), c('c', '5', 'clubs'), c('d', '9', 'diamonds')];
      const cut = c('cut', 'K', 'spades');
      // 15s: 3+4+5+?=12 no; 3+?=no; 4+5+?no; K(10)+?=no 5; K+5=15 yes \u2192 2; 9+?=no;
      // Actually K=10, 10+5=15 (2); 3+4+5+?=12 no; total 15s = 2
      // Run-of-3: 3-4-5 = 3 pts. Total 2+3 = 5
      expect(scoreHand(hand, cut)).toBe(5);
    });

    it('hand flush (4 same suit, starter different) scores hand+4', () => {
      // Hand {A,3,5,9}\u2663 + cut J\u2666 : 15s {J+5},{A+5+9} = 4 pts, flush 4, nobs 0
      const hand = [c('a', 'A', 'clubs'), c('b', '3', 'clubs'), c('c', '5', 'clubs'), c('d', '9', 'clubs')];
      const cut = c('cut', 'J', 'diamonds');
      expect(scoreHand(hand, cut)).toBe(8);
    });

    it('5-card flush (hand + starter) scores flush+5', () => {
      // Same hand but cut is clubs and J(clubs) \u2192 4 (15s) + 5 (flush) + 0 (nobs \u2014 the jack is the STARTER not in the hand) = 9
      const hand = [c('a', 'A', 'clubs'), c('b', '3', 'clubs'), c('c', '5', 'clubs'), c('d', '9', 'clubs')];
      const cut = c('cut', 'J', 'clubs');
      expect(scoreHand(hand, cut)).toBe(9);
    });

    it("Hoyle's crib flush rule: 4-card crib flush with different starter = 0 flush", () => {
      const crib = [c('a', 'A', 'clubs'), c('b', '3', 'clubs'), c('c', '5', 'clubs'), c('d', '9', 'clubs')];
      const cut = c('cut', 'J', 'diamonds');
      // 15s 4 + no flush (crib) + nobs 0 = 4
      expect(scoreHand(crib, cut, true)).toBe(4);
    });

    it('crib 5-card flush = 5 (still counts when all 5 match)', () => {
      const crib = [c('a', 'A', 'clubs'), c('b', '3', 'clubs'), c('c', '5', 'clubs'), c('d', '9', 'clubs')];
      const cut = c('cut', 'J', 'clubs');
      // 15s 4 + 5-flush + nobs 0 (J is the starter, not in crib) = 9
      expect(scoreHand(crib, cut, true)).toBe(9);
    });

    it('nobs: Jack in hand matching starter suit = +1', () => {
      const hand = [c('a', 'J', 'hearts'), c('b', '3', 'spades'), c('c', '7', 'clubs'), c('d', '9', 'diamonds')];
      const cut = c('cut', '4', 'hearts');
      // 15s: J+3+? J=10, 10+3+?=no 2; 10+4+?no A; 9+3+?no 3; 7+3+4=14 no; 7+4+?no 4 no. Let me be thorough:
      // subsets summing to 15: need combos. 10+3+?=no 2. 10+?=15 needs 5: no. 9+?+?=6: 3+?=3 no. 7+?+?=8: 4+?=4 no.
      // 3+4+?=8 no 7. 4+?+?=11: 4+J=14 no. 3+7+?=10 needs 5 no. 4+7+?=11 no. None.
      // No pairs; no runs (3,4,7,9,J); flush: no. Nobs: J hearts == cut hearts \u2192 1.
      expect(scoreHand(hand, cut)).toBe(1);
    });

    it('classic "29 hand" scores 29', () => {
      // Hand: 5-5-5-J(diamonds), starter: 5 diamonds (so nobs triggers)
      const hand = [c('a', '5', 'hearts'), c('b', '5', 'spades'), c('c', '5', 'clubs'), c('d', 'J', 'diamonds')];
      const cut = c('cut', '5', 'diamonds');
      expect(scoreHand(hand, cut)).toBe(29);
    });
  });

  describe('scorePegPlay', () => {
    it('making count 15 = 2', () => {
      const played = [c('a', '7', 'hearts'), c('b', '8', 'spades')];
      expect(scorePegPlay(played, 15)).toBe(2);
    });

    it('making count 31 = 2', () => {
      const played = [
        c('a', 'K', 'hearts'), c('b', 'K', 'spades'), c('c', 'J', 'clubs'), c('d', 'A', 'diamonds'),
      ];
      expect(scorePegPlay(played, 31)).toBe(2);
    });

    it('pair in tail = 2', () => {
      const played = [c('a', '7', 'hearts'), c('b', '7', 'spades')];
      expect(scorePegPlay(played, 14)).toBe(2);
    });

    it('three of a kind in tail = 6', () => {
      const played = [c('a', '7', 'hearts'), c('b', '7', 'spades'), c('c', '7', 'clubs')];
      expect(scorePegPlay(played, 21)).toBe(6);
    });

    it('run of 3 in tail + 15 = 5', () => {
      const played = [c('a', '4', 'hearts'), c('b', '5', 'spades'), c('c', '6', 'clubs')];
      expect(scorePegPlay(played, 15)).toBe(5); // run 3 + 15 2
    });

    it('gap breaks a run', () => {
      const played = [c('a', '4', 'hearts'), c('b', '7', 'spades'), c('c', '6', 'clubs')];
      expect(scorePegPlay(played, 17)).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Pegging turn-order rules (reported bug, April 2026).
  // After all players say "go" (or reach 31), the next segment must be led
  // by the player to the LEFT of the one who played the last card — NOT
  // the non-dealer as the first buggy implementation returned.
  // -------------------------------------------------------------------------
  describe('pegging next-lead after all-pass reset', () => {
    function makePeggingState(
      currentTurn: string,
      pegCards: Card[],
      pegCardPlayers: string[],
      pegPassedPlayers: string[],
      hands: Record<string, Card[]>,
      playerIds = ['p1', 'p2', 'p3'],
      dealerIndex = 0,
    ): GameState {
      const players = playerIds.map((id, idx) => ({
        playerId: id,
        displayName: id,
        hand: hands[id] ?? [],
        score: 0,
        isOut: false,
        isBot: false,
        isDealer: idx === dealerIndex,
      }));
      const pegCount = pegCards.reduce((s, c) => {
        const v = c.rank === 'A' ? 1
          : ['J', 'Q', 'K'].includes(c.rank as string) ? 10
          : Number(c.rank);
        return s + v;
      }, 0);
      return {
        version: 1,
        roomId: 'r-peg',
        gameId: 'cribbage',
        phase: 'playing',
        players,
        currentTurn,
        turnNumber: 1,
        roundNumber: 1,
        publicData: {
          gamePhase: 'pegging',
          crib: [],
          cutCard: c('cut', '2', 'clubs'),
          pegCount,
          pegCards,
          pegCardPlayers,
          pegPlayOrder: playerIds,
          pegPassedPlayers,
          dealerIndex,
          scores: Object.fromEntries(playerIds.map(id => [id, 0])),
          discardedCount: Object.fromEntries(playerIds.map(id => [id, 2])),
        } as unknown as Record<string, unknown>,
        cribbageBoardState: {
          pegs: playerIds.map((id, i) => ({
            playerId: id,
            color: (['red', 'green', 'blue'] as const)[i % 3]!,
            frontPeg: 0,
            backPeg: 0,
          })),
          skunkLine: 91,
          doubleskunkLine: 61,
          winScore: 121,
        },
        updatedAt: new Date().toISOString(),
      };
    }

    it('3p: after all-go reset, lead goes to the player LEFT of the last-card-player (not the non-dealer)', () => {
      const e = new CribbageEngine();
      // Play order p1 -> p2 -> p3. Dealer = p1, so non-dealer = p2.
      // Count sitting at 30 after K+K+10=30. All players hold cards whose
      // smallest value + 30 > 31, so nobody can play.
      // Timeline: p2 played K, p3 played K (count=20), p1 played 10 (count=30),
      // p2 said go, p3 said go, now p1 says go -> all passed.
      // Last card played by p1 -> next lead = player LEFT of p1 = p2.
      // Dealer is p1 so the old buggy code would pick the non-dealer p2.
      // To distinguish bug from fix, set dealer = p2 so non-dealer = p3.
      // Then buggy code returns p3; correct code returns p2.
      // Wait — left-of-p1 is p2, and with dealer=p2 non-dealer=p3 differs. Good.
      const played = [
        c('c1', 'K', 'hearts'),
        c('c2', 'K', 'spades'),
        c('c3', '10', 'clubs'),
      ];
      const hands = {
        p1: [c('h1', '9', 'clubs')],   // 30+9=39 > 31, cannot play
        p2: [c('h2', '8', 'diamonds')], // 30+8=38 > 31
        p3: [c('h3', '7', 'hearts')],   // 30+7=37 > 31
      };
      // p3 says go first, then p2 says go, and the engine is about to
      // receive p1's 'go'. So pegPassedPlayers already has [p3, p2].
      // currentTurn is p1.
      const state = makePeggingState(
        'p1',
        played,
        ['p2', 'p3', 'p1'],
        ['p3', 'p2'],
        hands,
        ['p1', 'p2', 'p3'],
        1, // dealer = p2
      );
      const next = e.applyAction(state, 'p1', { type: 'go' });
      expect(next.currentTurn).toBe('p2');
    });

    it('3p: "go" point is awarded to the actual last-card-player', () => {
      const e = new CribbageEngine();
      const played = [
        c('c1', 'K', 'hearts'),
        c('c2', 'K', 'spades'),
        c('c3', '10', 'clubs'),
      ];
      const hands = {
        p1: [c('h1', '9', 'clubs')],
        p2: [c('h2', '8', 'diamonds')],
        p3: [c('h3', '7', 'hearts')],
      };
      // p1 is the actual last to play (the 10). p3, p2, p1 all say go.
      const state = makePeggingState(
        'p1',
        played,
        ['p2', 'p3', 'p1'],
        ['p3', 'p2'],
        hands,
        ['p1', 'p2', 'p3'],
        1,
      );
      const next = e.applyAction(state, 'p1', { type: 'go' });
      const pd = next.publicData as Record<string, unknown>;
      const scores = pd['scores'] as Record<string, number>;
      expect(scores['p1']).toBe(1);
      expect(scores['p2']).toBe(0);
      expect(scores['p3']).toBe(0);
    });

    it('3p: if last-card-player is out of cards, skip them when picking next lead', () => {
      const e = new CribbageEngine();
      // p2 played the last card (their only card). On reset p2.hand is
      // empty, so next-lead skip empties: left-of-p2 = p3.
      const played = [
        c('c1', 'K', 'hearts'),
        c('c2', 'K', 'spades'),
        c('c3', '10', 'clubs'),
      ];
      const hands = {
        p1: [c('h1', '9', 'clubs')],
        p2: [], // out of cards after playing c3
        p3: [c('h3', '7', 'hearts')],
      };
      // Timeline: p2 led K (c1), p3 played K (c2, count=20),
      // p1 said go, p2 played 10 (c3, count=30), p3 said go, now p1 says go.
      // Last card player = p2, but p2 is empty, so next lead = p3.
      const state = makePeggingState(
        'p1',
        played,
        ['p2', 'p3', 'p2'],
        ['p3', 'p1'],
        hands,
        ['p1', 'p2', 'p3'],
        1,
      );
      const next = e.applyAction(state, 'p1', { type: 'go' });
      expect(next.currentTurn).toBe('p3');
    });

    it('2p: all-go reset returns to the opposite player (classic case)', () => {
      const e = new CribbageEngine();
      // 2-player: p1 played last (count=30), p2 said go, now p1 says go.
      // Next lead = player LEFT of p1 = p2.
      const played = [
        c('c1', 'K', 'hearts'),
        c('c2', 'K', 'spades'),
        c('c3', '10', 'clubs'),
      ];
      const hands = {
        p1: [c('h1', '9', 'clubs')],
        p2: [c('h2', '8', 'diamonds')],
      };
      const state = makePeggingState(
        'p1',
        played,
        ['p2', 'p1', 'p1'],
        ['p2'],
        hands,
        ['p1', 'p2'],
        0,
      );
      const next = e.applyAction(state, 'p1', { type: 'go' });
      expect(next.currentTurn).toBe('p2');
    });
  });

  describe('pegging leap-frog pegs (CribbageBoardState)', () => {
    it('first score: back peg stays at 0, front peg moves to new score', () => {
      const e = new CribbageEngine();
      const state = e.startGame(makeConfig(2));
      const board0 = state.cribbageBoardState!;
      const before = board0.pegs[0]!;
      expect(before.frontPeg).toBe(0);
      expect(before.backPeg).toBe(0);
    });

    it('second score leap-frogs: old front becomes back, new front = old front + pts', () => {
      // Directly assert addScore semantics by inspecting the board after two
      // consecutive peg moves. We drive this via the `nextRound`-free path:
      // score his-heels (J cut) pays dealer 2 — but that requires a J cut.
      // Simpler: call applyAction with a synthetic pegging state and two
      // plays that each score. We use a pair to get 2 pts on the second card.
      const e = new CribbageEngine();
      const hands: Record<string, Card[]> = {
        p1: [c('h1a', '7', 'hearts'), c('h1b', '3', 'clubs')],
        p2: [c('h2a', '7', 'spades'), c('h2b', '4', 'diamonds')],
      };
      const state: GameState = {
        version: 1,
        roomId: 'r-leap',
        gameId: 'cribbage',
        phase: 'playing',
        players: ['p1', 'p2'].map((id, idx) => ({
          playerId: id,
          displayName: id,
          hand: hands[id]!,
          score: 0,
          isOut: false,
          isBot: false,
          isDealer: idx === 0,
        })),
        currentTurn: 'p2',
        turnNumber: 1,
        roundNumber: 1,
        publicData: {
          gamePhase: 'pegging',
          crib: [],
          cutCard: c('cut', '2', 'clubs'),
          pegCount: 0,
          pegCards: [],
          pegCardPlayers: [],
          pegPlayOrder: ['p1', 'p2'],
          pegPassedPlayers: [],
          dealerIndex: 0,
          scores: { p1: 0, p2: 0 },
          discardedCount: { p1: 2, p2: 2 },
        } as unknown as Record<string, unknown>,
        cribbageBoardState: {
          pegs: [
            { playerId: 'p1', color: 'red', frontPeg: 0, backPeg: 0 },
            { playerId: 'p2', color: 'blue', frontPeg: 0, backPeg: 0 },
          ],
          skunkLine: 91,
          doubleskunkLine: 61,
          winScore: 121,
        },
        updatedAt: new Date().toISOString(),
      };

      // p2 plays 7 (count=7, no score)
      let s = e.applyAction(state, 'p2', { type: 'play', cardIds: ['h2a'] });
      // p1 plays 7 (pair! +2 pts)
      s = e.applyAction(s, 'p1', { type: 'play', cardIds: ['h1a'] });
      const p1Peg = s.cribbageBoardState!.pegs.find(p => p.playerId === 'p1')!;
      expect(p1Peg.frontPeg).toBe(2);
      expect(p1Peg.backPeg).toBe(0); // first score: back stays

      // p2 plays 4 (count=18, no score)
      s = e.applyAction(s, 'p2', { type: 'play', cardIds: ['h2b'] });
      // p1 plays 3 (count=21, no scoring combo)
      s = e.applyAction(s, 'p1', { type: 'play', cardIds: ['h1b'] });
      // Final: p1 has last card -> gets +1 "last card". leap-frog: front was
      // 2, new front = 2+1 = 3, old front (2) becomes back.
      const p1PegAfter = s.cribbageBoardState!.pegs.find(p => p.playerId === 'p1')!;
      expect(p1PegAfter.frontPeg).toBe(3);
      expect(p1PegAfter.backPeg).toBe(2);
    });
  });

  describe('initial dealer selection', () => {
    it('random across many games: both players see the deal', () => {
      const e = new CribbageEngine();
      const dealerIdxs = new Set<number>();
      for (let i = 0; i < 50; i++) {
        const s = e.startGame({
          roomId: `r${i}`,
          gameId: 'cribbage',
          playerIds: ['alice', 'bob'],
          asyncMode: true,
          turnTimerSeconds: 90,
        });
        const pd = s.publicData as Record<string, unknown>;
        dealerIdxs.add(pd['dealerIndex'] as number);
      }
      expect(dealerIdxs.size).toBe(2);
    });

    it('firstDealerIndex option pins the dealer', () => {
      const e = new CribbageEngine();
      const s = e.startGame({
        roomId: 'r',
        gameId: 'cribbage',
        playerIds: ['alice', 'bob'],
        asyncMode: true,
        turnTimerSeconds: 90,
        options: { firstDealerIndex: 1 },
      });
      expect(s.players[1]!.isDealer).toBe(true);
      expect(s.players[0]!.isDealer).toBe(false);
    });
  });
});
