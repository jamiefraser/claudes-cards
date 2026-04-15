/**
 * Cribbage Game Engine — SPEC.md §19 Story 8.4
 *
 * Standard 52-card deck, 2–4 players.
 * Deal 6 cards each (2p). Each player discards 2 to crib.
 * Cut card. Jack cut = "His Heels" (2 pts dealer).
 * Pegging: play cards summing toward 31; 15=2, 31=2, pairs/runs, "Go"=1.
 * Counting hand: 15s=2, pairs=2, runs, flush, nobs.
 * Win: first to 121.
 *
 * CribbageBoardState tracked in state.cribbageBoardState.
 */

import type {
  IGameEngine,
  GameConfig,
  GameState,
  PlayerAction,
  PlayerRanking,
  Card,
  CribbageBoardState,
  CribbagePegSet,
} from '@card-platform/shared-types';
import { createStandardDeck } from '@card-platform/cards-engine';
import { logger } from '../../utils/logger';

// -------------------------------------------------------------------------
// Internal game phase tracker
// -------------------------------------------------------------------------

type CribbagePhase = 'discarding' | 'cutting' | 'pegging' | 'counting' | 'ended';

interface CribbagePublicData {
  gamePhase: CribbagePhase;
  crib: Card[];
  cutCard: Card | null;
  pegCount: number;       // running pegging total
  pegCards: Card[];       // cards played this pegging round
  /** Player who played each card in pegCards, parallel array. Used to
   * correctly attribute the "go" point and to determine the next leader
   * after an all-pass reset. Always the same length as pegCards. */
  pegCardPlayers: string[];
  pegPlayOrder: string[]; // playerIds in peg-play order
  pegPassedPlayers: string[]; // players who have said "go"
  dealerIndex: number;
  scores: Record<string, number>;
  discardedCount: Record<string, number>; // how many each player has discarded to crib
  /** Snapshot of each player's 4-card hand taken at the end of discarding, used
   * for "the show" scoring. Pegging drains player.hand to empty, so without
   * this snapshot the counting round would score nothing. */
  scoringHands?: Record<string, Card[]>;
  /** Counting sub-phase:
   *   'hand' — one player is counting their hand (currentCountPlayerId).
   *   'crib' — dealer is counting the crib.
   * Only set while gamePhase === 'counting'. */
  countingStep?: 'hand' | 'crib';
  /** Order in which players count their hands: starts with the player to the
   * dealer's left (clockwise from dealer+1) and ends with the dealer. */
  countOrder?: string[];
  /** How many hands have already been counted this round. */
  countIndex?: number;
  /** Whose turn it is to count (hand step) or ack the crib (crib step). */
  currentCountPlayerId?: string;
  /** Per-player points from the show — precomputed at counting start so the
   * UI can display the score for the current counter before they ack. */
  handScores?: Record<string, number>;
  /** Crib score (for UI display during the 'crib' step). */
  cribScore?: number;
}

const PEG_COLORS: Array<'red' | 'green' | 'blue'> = ['red', 'green', 'blue'];

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

export function cardValue(card: Card): number {
  if (!card.rank) return 0;
  if (card.rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

export function rankOrder(rank: string): number {
  const order: Record<string, number> = {
    A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
  };
  return order[rank] ?? 0;
}

/** Count 15-combinations in a set of cards (2 pts each). */
function count15s(cards: Card[]): number {
  let count = 0;
  const n = cards.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) sum += cardValue(cards[i]!);
    }
    if (sum === 15) count++;
  }
  return count * 2;
}

/** Count pairs in a set of cards (2 pts per pair). */
function countPairs(cards: Card[]): number {
  let count = 0;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i]!.rank === cards[j]!.rank) count += 2;
    }
  }
  return count;
}

/** Count runs of 3+ in a set of cards. */
function countRuns(cards: Card[]): number {
  const n = cards.length;
  let best = 0;
  // Check all subsets of size 3+
  for (let mask = 1; mask < (1 << n); mask++) {
    const subset: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(rankOrder(cards[i]!.rank ?? ''));
    }
    if (subset.length < 3) continue;
    subset.sort((a, b) => a - b);
    // Check consecutive
    let consecutive = true;
    for (let i = 1; i < subset.length; i++) {
      if (subset[i] !== subset[i - 1]! + 1) { consecutive = false; break; }
    }
    if (consecutive && subset.length > best) best = subset.length;
  }
  // Count occurrences of the best run length
  if (best < 3) return 0;

  let runCount = 0;
  for (let mask = 1; mask < (1 << n); mask++) {
    const subset: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(rankOrder(cards[i]!.rank ?? ''));
    }
    if (subset.length !== best) continue;
    subset.sort((a, b) => a - b);
    let consecutive = true;
    for (let i = 1; i < subset.length; i++) {
      if (subset[i] !== subset[i - 1]! + 1) { consecutive = false; break; }
    }
    if (consecutive) runCount++;
  }
  return runCount * best;
}

/**
 * Count flush (Hoyle's rules):
 *   - For a regular hand: 4 of one suit in the hand = 4; all 5 (incl. starter) = 5.
 *   - For the crib: counts ONLY if all 5 (crib + starter) are one suit = 5; a
 *     4-suit crib hand scores 0.
 */
function countFlush(hand: Card[], cutCard: Card | null, isCrib = false): number {
  if (hand.length < 4) return 0;
  const suit = hand[0]!.suit;
  const allSameSuit = hand.every(c => c.suit === suit);
  if (!allSameSuit) return 0;
  if (cutCard && cutCard.suit === suit) return 5;
  if (isCrib) return 0; // crib flush requires the starter too
  return 4;
}

/** Count nobs: Jack in hand matching cut card suit (1 pt). */
function countNobs(hand: Card[], cutCard: Card | null): number {
  if (!cutCard) return 0;
  return hand.some(c => c.rank === 'J' && c.suit === cutCard.suit) ? 1 : 0;
}

export function scoreHand(
  hand: Card[],
  cutCard: Card | null,
  isCrib = false,
): number {
  const cards = cutCard ? [...hand, cutCard] : [...hand];
  return (
    count15s(cards) +
    countPairs(cards) +
    countRuns(cards) +
    countFlush(hand, cutCard, isCrib) +
    countNobs(hand, cutCard)
  );
}

/** Score pegging play: 15, 31, pairs, runs from last played cards. */
export function scorePegPlay(playedCards: Card[], count: number): number {
  let pts = 0;
  if (count === 15) pts += 2;
  if (count === 31) pts += 2;

  // Pairs from the tail
  if (playedCards.length >= 2) {
    const last = playedCards[playedCards.length - 1]!;
    let pairCount = 0;
    for (let i = playedCards.length - 2; i >= 0; i--) {
      if (playedCards[i]!.rank === last.rank) pairCount++;
      else break;
    }
    if (pairCount >= 3) pts += 12; // 4 of a kind
    else if (pairCount === 2) pts += 6; // 3 of a kind
    else if (pairCount === 1) pts += 2; // pair
  }

  // Runs from the tail (3+)
  if (playedCards.length >= 3) {
    for (let len = playedCards.length; len >= 3; len--) {
      const tail = playedCards.slice(playedCards.length - len);
      const orders = tail.map(c => rankOrder(c.rank ?? '')).sort((a, b) => a - b);
      let consecutive = true;
      for (let i = 1; i < orders.length; i++) {
        if (orders[i] !== orders[i - 1]! + 1) { consecutive = false; break; }
      }
      if (consecutive) { pts += len; break; }
    }
  }

  return pts;
}

function addScore(
  state: GameState,
  pd: CribbagePublicData,
  playerId: string,
  points: number,
): { newPlayers: GameState['players']; newScores: Record<string, number>; gameEnded: boolean } {
  const current = pd.scores[playerId] ?? 0;
  const newScore = current + points;
  const newScores = { ...pd.scores, [playerId]: newScore };
  const newPlayers = state.players.map(p => {
    if (p.playerId !== playerId) return p;
    return { ...p, score: newScore };
  });
  const board = state.cribbageBoardState;
  const pegSet = board?.pegs.find(peg => peg.playerId === playerId);
  if (pegSet) {
    pegSet.backPeg = pegSet.frontPeg;
    pegSet.frontPeg = Math.min(121, newScore);
  }
  return { newPlayers, newScores, gameEnded: newScore >= 121 };
}

function buildBoard(playerIds: string[]): CribbageBoardState {
  return {
    pegs: playerIds.map((playerId, idx) => ({
      playerId,
      color: PEG_COLORS[idx % 3]!,
      frontPeg: 0,
      backPeg: 0,
    })),
    skunkLine: 91,
    doubleskunkLine: 61,
    winScore: 121,
  };
}

function nextPeggingPlayer(
  playerIds: string[],
  currentId: string,
  passed: string[],
): string | null {
  const n = playerIds.length;
  const idx = playerIds.indexOf(currentId);
  for (let i = 1; i <= n; i++) {
    const next = playerIds[(idx + i) % n]!;
    if (!passed.includes(next)) return next;
  }
  return null; // everyone has passed
}

export class CribbageEngine implements IGameEngine {
  readonly gameId = 'cribbage';
  readonly supportsAsync = true;
  readonly minPlayers = 2;
  readonly maxPlayers = 4;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    if (playerIds.length < 2 || playerIds.length > 4) {
      throw new Error('Cribbage requires 2–4 players');
    }

    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    // Hoyle's "cut for deal" — pick a random initial dealer. Tests can pin a
    // specific dealer by passing `options.firstDealerIndex`.
    const optDealer = (config.options as Record<string, unknown> | undefined)?.[
      'firstDealerIndex'
    ];
    const dealerIndex =
      typeof optDealer === 'number' && optDealer >= 0 && optDealer < playerIds.length
        ? optDealer
        : Math.floor(Math.random() * playerIds.length);

    // Deal 6 cards each for 2p; 5 for 3–4p (simplified: always 6 for 2p)
    const dealAmt = playerIds.length === 2 ? 6 : 5;

    const players = playerIds.map((playerId, idx) => ({
      playerId,
      displayName: playerId,
      hand: cards.splice(0, dealAmt).map(c => ({ ...c, faceUp: false })),
      score: 0,
      isOut: false,
      isBot: false,
      isDealer: idx === dealerIndex,
    }));

    const scores: Record<string, number> = {};
    const discardedCount: Record<string, number> = {};
    for (const id of playerIds) {
      scores[id] = 0;
      discardedCount[id] = 0;
    }

    const publicData: CribbagePublicData = {
      gamePhase: 'discarding',
      crib: [],
      cutCard: null,
      pegCount: 0,
      pegCards: [],
      pegCardPlayers: [],
      pegPlayOrder: [...playerIds],
      pegPassedPlayers: [],
      dealerIndex,
      scores,
      discardedCount,
    };

    const board = buildBoard(playerIds);

    logger.debug('CribbageEngine.startGame', { roomId, playerCount: playerIds.length });

    return {
      version: 1,
      roomId,
      gameId,
      phase: 'playing',
      players,
      currentTurn: playerIds[0]!,
      turnNumber: 1,
      roundNumber: 1,
      publicData: publicData as unknown as Record<string, unknown>,
      cribbageBoardState: board,
      updatedAt: new Date().toISOString(),
    };
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    const pd = state.publicData as unknown as CribbagePublicData;

    switch (action.type) {
      case 'discard-crib':
        return this.handleDiscardCrib(state, playerId, action, pd);
      case 'play':
        if (state.currentTurn !== playerId) throw new Error(`Not ${playerId}'s turn to peg`);
        return this.handlePegPlay(state, playerId, action, pd);
      case 'go':
        if (state.currentTurn !== playerId) throw new Error(`Not ${playerId}'s turn`);
        return this.handleGo(state, playerId, pd);
      case 'ack-count':
        return this.handleAckCount(state, playerId, pd);
      default:
        throw new Error(`Unknown action: ${action.type}`);
    }
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    const pd = state.publicData as unknown as CribbagePublicData;

    if (pd.gamePhase === 'discarding') {
      const player = state.players.find(p => p.playerId === playerId);
      if (!player) return [];
      const discarded = pd.discardedCount[playerId] ?? 0;
      const needed = state.players.length === 2 ? 2 : 1;
      if (discarded >= needed) return [];
      return player.hand.map(c => ({ type: 'discard-crib', cardIds: [c.id] }));
    }

    if (pd.gamePhase === 'pegging') {
      if (state.currentTurn !== playerId) return [];
      const player = state.players.find(p => p.playerId === playerId);
      if (!player) return [];
      const playable = player.hand.filter(c => cardValue(c) + pd.pegCount <= 31);
      const actions: PlayerAction[] = playable.map(c => ({ type: 'play', cardIds: [c.id] }));
      if (playable.length === 0) actions.push({ type: 'go' });
      return actions;
    }

    return [];
  }

  computeResult(state: GameState): PlayerRanking[] {
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    return sorted.map((p, idx) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      rank: idx + 1,
      score: p.score,
      isBot: p.isBot,
    }));
  }

  isGameOver(state: GameState): boolean {
    return state.phase === 'ended';
  }

  // -------------------------------------------------------------------------
  // Discard to crib
  // -------------------------------------------------------------------------

  private handleDiscardCrib(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: CribbagePublicData,
  ): GameState {
    if (pd.gamePhase !== 'discarding') throw new Error('Not in discarding phase');
    // Discarding is logically parallel — we do NOT gate on state.currentTurn.
    // Every player independently contributes cards to the crib; ordering
    // between players is irrelevant.
    const cardIds = action.cardIds ?? [];
    if (cardIds.length === 0) throw new Error('No cards specified');

    const player = state.players.find(p => p.playerId === playerId);
    if (!player) throw new Error(`Player ${playerId} not in game`);

    const needed = state.players.length === 2 ? 2 : 1;
    const discarded = pd.discardedCount[playerId] ?? 0;
    if (discarded + cardIds.length > needed) {
      throw new Error(`${playerId} can discard at most ${needed - discarded} more card(s)`);
    }

    // Validate every card is in the player's hand before mutating.
    const cards: Card[] = cardIds.map(id => {
      const c = player.hand.find(h => h.id === id);
      if (!c) throw new Error(`Card ${id} not in ${playerId}'s hand`);
      return c;
    });

    const discardSet = new Set(cardIds);
    const newHand = player.hand.filter(c => !discardSet.has(c.id));
    const newCrib = [...pd.crib, ...cards.map(c => ({ ...c, faceUp: false }))];
    const newDiscardedCount = { ...pd.discardedCount, [playerId]: discarded + cardIds.length };

    // Check if all players done discarding
    const totalNeeded = state.players.length * needed;
    const totalDiscarded = Object.values(newDiscardedCount).reduce((a, b) => a + b, 0);
    const allDone = totalDiscarded >= totalNeeded;

    const newPublicData: CribbagePublicData = {
      ...pd,
      crib: newCrib,
      discardedCount: newDiscardedCount,
    };

    let newState: GameState = {
      ...state,
      version: state.version + 1,
      players: state.players.map(p =>
        p.playerId === playerId ? { ...p, hand: newHand } : p
      ),
      publicData: newPublicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };

    if (allDone) {
      // Move to cutting phase — auto-cut for simplicity
      newState = this.performCut(newState, newPublicData);
    }

    return newState;
  }

  private performCut(state: GameState, pd: CribbagePublicData): GameState {
    // Auto-cut: use a deterministic approach (take a card from the "virtual" remaining deck)
    // Since we don't track remaining deck after deal, create remaining cards
    const usedIds = new Set<string>([
      ...state.players.flatMap(p => p.hand.map(c => c.id)),
      ...pd.crib.map(c => c.id),
    ]);

    const fullDeck = createStandardDeck().cards;
    const remaining = fullDeck.filter(c => !usedIds.has(c.id));
    shuffle(remaining);
    const cutCard = remaining[0] ? { ...remaining[0], faceUp: true } : null;

    // Snapshot each player's hand for "the show" — pegging will drain
    // player.hand to empty, so the counting phase needs this copy.
    const scoringHands: Record<string, Card[]> = {};
    for (const p of state.players) {
      scoringHands[p.playerId] = p.hand.map(c => ({ ...c }));
    }

    // His Heels: if cut card is a Jack, dealer gets 2 pts
    const dealerPlayer = state.players[pd.dealerIndex];
    let newPlayers = [...state.players];
    let newScores = { ...pd.scores };
    let gameEnded = false;
    const board = state.cribbageBoardState
      ? JSON.parse(JSON.stringify(state.cribbageBoardState)) as CribbageBoardState
      : buildBoard(state.players.map(p => p.playerId));

    if (cutCard?.rank === 'J' && dealerPlayer) {
      const result = addScore(
        { ...state, cribbageBoardState: board },
        { ...pd, scores: newScores },
        dealerPlayer.playerId,
        2,
      );
      newPlayers = result.newPlayers;
      newScores = result.newScores;
      gameEnded = result.gameEnded;
      // `board` is mutated in place by addScore — do not re-clone from state.
    }

    // Non-dealer leads pegging
    const nonDealerIdx = (pd.dealerIndex + 1) % state.players.length;
    const firstPegPlayer = state.players[nonDealerIdx]!.playerId;

    const newPublicData: CribbagePublicData = {
      ...pd,
      gamePhase: gameEnded ? 'ended' : 'pegging',
      cutCard,
      scores: newScores,
      pegCount: 0,
      pegCards: [],
      pegCardPlayers: [],
      pegPlayOrder: state.players.map(p => p.playerId),
      pegPassedPlayers: [],
      scoringHands,
    };

    return {
      ...state,
      version: state.version + 1,
      phase: gameEnded ? 'ended' : 'playing',
      players: newPlayers,
      currentTurn: gameEnded ? null : firstPegPlayer,
      cribbageBoardState: board,
      publicData: newPublicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Pegging actions
  // -------------------------------------------------------------------------

  private handlePegPlay(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: CribbagePublicData,
  ): GameState {
    if (pd.gamePhase !== 'pegging') throw new Error('Not in pegging phase');
    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified');

    const player = state.players.find(p => p.playerId === playerId)!;
    const card = player.hand.find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} not in hand`);

    const newCount = pd.pegCount + cardValue(card);
    if (newCount > 31) throw new Error(`Playing ${card.rank} would exceed 31`);

    const newHand = player.hand.filter(c => c.id !== cardId);
    const newPegCards = [...pd.pegCards, { ...card, faceUp: true }];
    const newPegCardPlayers = [...pd.pegCardPlayers, playerId];

    // Score the peg play
    const pegPts = scorePegPlay(newPegCards, newCount);

    let board = state.cribbageBoardState
      ? JSON.parse(JSON.stringify(state.cribbageBoardState)) as CribbageBoardState
      : buildBoard(state.players.map(p => p.playerId));

    let newPlayers = state.players.map(p =>
      p.playerId === playerId ? { ...p, hand: newHand } : p
    );
    let newScores = pd.scores;
    let gameEnded = false;

    if (pegPts > 0) {
      const result = addScore(
        { ...state, players: newPlayers, cribbageBoardState: board },
        { ...pd, scores: newScores },
        playerId,
        pegPts,
      );
      newPlayers = result.newPlayers;
      newScores = result.newScores;
      gameEnded = result.gameEnded;
    }

    // Check for 31
    let resetPeg = newCount === 31;
    let pegCount = resetPeg ? 0 : newCount;
    let pegCards = resetPeg ? [] : newPegCards;
    let pegCardPlayers = resetPeg ? [] : newPegCardPlayers;
    let pegPassedPlayers = resetPeg ? [] : pd.pegPassedPlayers;

    if (gameEnded) {
      return {
        ...state,
        version: state.version + 1,
        phase: 'ended',
        players: newPlayers,
        currentTurn: null,
        cribbageBoardState: board,
        publicData: {
          ...pd,
          gamePhase: 'ended',
          pegCount,
          pegCards,
          pegCardPlayers,
          pegPassedPlayers,
          scores: newScores,
        } as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      };
    }

    // Check if pegging phase is over (all hands empty). Per Hoyle's, the
    // last player to play scores 1 for "last card" (unless they just hit 31,
    // which already paid 2 and won't be awarded again).
    const allHandsEmpty = newPlayers.every(p => p.hand.length === 0);
    if (allHandsEmpty) {
      if (!resetPeg) {
        const lastCardResult = addScore(
          { ...state, players: newPlayers, cribbageBoardState: board },
          { ...pd, scores: newScores },
          playerId,
          1,
        );
        newPlayers = lastCardResult.newPlayers;
        newScores = lastCardResult.newScores;
        if (lastCardResult.gameEnded) {
          return {
            ...state,
            version: state.version + 1,
            phase: 'ended',
            players: newPlayers,
            currentTurn: null,
            cribbageBoardState: board,
            publicData: {
              ...pd,
              gamePhase: 'ended',
              pegCount: 0,
              pegCards: [],
              pegCardPlayers: [],
              pegPassedPlayers: [],
              scores: newScores,
            } as unknown as Record<string, unknown>,
            updatedAt: new Date().toISOString(),
          };
        }
      }
      return this.moveToCountingPhase({ ...state, players: newPlayers, cribbageBoardState: board }, { ...pd, scores: newScores });
    }

    // Determine next pegging player (skip those who passed or have no playable cards)
    const nextId = nextPeggingPlayer(
      pd.pegPlayOrder,
      playerId,
      pegPassedPlayers,
    );

    // Check if next player can play
    let finalNext = nextId;
    if (nextId) {
      const nextPlayer = newPlayers.find(p => p.playerId === nextId)!;
      if (nextPlayer.hand.length === 0) {
        // Skip them
        finalNext = nextPeggingPlayer(pd.pegPlayOrder, nextId, [...pegPassedPlayers, nextId]);
      }
    }

    return {
      ...state,
      version: state.version + 1,
      players: newPlayers,
      currentTurn: finalNext,
      cribbageBoardState: board,
      publicData: {
        ...pd,
        pegCount,
        pegCards,
        pegCardPlayers,
        pegPassedPlayers,
        scores: newScores,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleGo(state: GameState, playerId: string, pd: CribbagePublicData): GameState {
    if (pd.gamePhase !== 'pegging') throw new Error('Not in pegging phase');
    const player = state.players.find(p => p.playerId === playerId)!;
    const canPlay = player.hand.some(c => cardValue(c) + pd.pegCount <= 31);
    if (canPlay) throw new Error('Cannot say "go" when you can play a card');

    const newPassed = [...pd.pegPassedPlayers, playerId];

    // Check if all active players passed
    const activePlayers = state.players.filter(p => p.hand.length > 0);
    const allPassed = activePlayers.every(p => newPassed.includes(p.playerId));

    let newScores = pd.scores;
    let newPlayers = [...state.players];
    let board = state.cribbageBoardState
      ? JSON.parse(JSON.stringify(state.cribbageBoardState)) as CribbageBoardState
      : buildBoard(state.players.map(p => p.playerId));
    let gameEnded = false;

    if (allPassed && pd.pegCards.length > 0) {
      // The last player to play a card in this pegging segment gets 1 pt
      // for "go". We track this precisely via the pegCardPlayers parallel
      // array rather than guessing from remaining hands — with 3+ players
      // any heuristic based on "not in prevPassed" is ambiguous.
      const pcp = pd.pegCardPlayers ?? [];
      const lastPlayedBy = pcp[pcp.length - 1] ?? playerId;

      const result = addScore(
        { ...state, players: newPlayers, cribbageBoardState: board },
        { ...pd, scores: newScores },
        lastPlayedBy,
        1,
      );
      newPlayers = result.newPlayers;
      newScores = result.newScores;
      gameEnded = result.gameEnded;

      // Reset peg
      const allHandsEmpty = newPlayers.every(p => p.hand.length === 0);
      if (gameEnded) {
        return {
          ...state,
          version: state.version + 1,
          phase: 'ended',
          players: newPlayers,
          currentTurn: null,
          cribbageBoardState: board,
          publicData: { ...pd, gamePhase: 'ended', pegCount: 0, pegCards: [], pegCardPlayers: [], pegPassedPlayers: [], scores: newScores } as unknown as Record<string, unknown>,
          updatedAt: new Date().toISOString(),
        };
      }

      if (allHandsEmpty) {
        return this.moveToCountingPhase({ ...state, players: newPlayers, cribbageBoardState: board }, { ...pd, scores: newScores });
      }

      // Reset peg round. Per Hoyle's, the next lead is the player to the
      // LEFT (next in pegPlayOrder) of whoever played the last card, skipping
      // any players whose hands are now empty.
      const emptyHandIds = newPlayers
        .filter(p => p.hand.length === 0)
        .map(p => p.playerId);
      const nextLead = nextPeggingPlayer(
        pd.pegPlayOrder,
        lastPlayedBy,
        emptyHandIds,
      );

      return {
        ...state,
        version: state.version + 1,
        players: newPlayers,
        currentTurn: nextLead,
        cribbageBoardState: board,
        publicData: {
          ...pd,
          pegCount: 0,
          pegCards: [],
          pegCardPlayers: [],
          pegPassedPlayers: [],
          scores: newScores,
        } as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      };
    }

    // Not all passed — advance to next non-passed player
    const nextId = nextPeggingPlayer(pd.pegPlayOrder, playerId, newPassed);

    return {
      ...state,
      version: state.version + 1,
      currentTurn: nextId,
      publicData: {
        ...pd,
        pegPassedPlayers: newPassed,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Counting phase (simplified — auto-score and end round)
  // -------------------------------------------------------------------------

  private moveToCountingPhase(state: GameState, pd: CribbagePublicData): GameState {
    // Counting is turn-based per Hoyle's rules: start with the player to the
    // dealer's left (clockwise from dealer+1), each counts in turn, dealer
    // counts last, then dealer counts the crib. Pegs advance *immediately*
    // on each player's ack — whoever reaches 121 first wins, even if later
    // players would have scored enough to catch up.
    const n = state.players.length;
    const countOrder: string[] = [];
    for (let i = 1; i <= n; i++) {
      countOrder.push(state.players[(pd.dealerIndex + i) % n]!.playerId);
    }

    // Precompute per-player hand scores so the UI can show each counter's
    // total as soon as it's their turn (and for screen-reader breakdown).
    const handScores: Record<string, number> = {};
    for (const p of state.players) {
      handScores[p.playerId] = scoreHand(pd.scoringHands?.[p.playerId] ?? [], pd.cutCard);
    }

    const board = state.cribbageBoardState
      ? JSON.parse(JSON.stringify(state.cribbageBoardState)) as CribbageBoardState
      : buildBoard(state.players.map(p => p.playerId));

    const firstCounter = countOrder[0]!;
    const nextPd: CribbagePublicData = {
      ...pd,
      gamePhase: 'counting',
      countingStep: 'hand',
      countOrder,
      countIndex: 0,
      currentCountPlayerId: firstCounter,
      handScores,
    };

    return {
      ...state,
      version: state.version + 1,
      phase: 'playing',
      // Set currentTurn to the active counter so the bot scheduler and UI
      // turn-cues both light up the right seat.
      currentTurn: firstCounter,
      cribbageBoardState: board,
      publicData: nextPd as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleAckCount(
    state: GameState,
    playerId: string,
    pd: CribbagePublicData,
  ): GameState {
    if (pd.gamePhase !== 'counting') throw new Error('Not in counting phase');
    const dealerPid = state.players[pd.dealerIndex]?.playerId;

    const board = state.cribbageBoardState
      ? JSON.parse(JSON.stringify(state.cribbageBoardState)) as CribbageBoardState
      : buildBoard(state.players.map(p => p.playerId));

    // --- Hand step: one player is counting their own hand. -----------------
    if (pd.countingStep === 'hand') {
      const currentPid = pd.currentCountPlayerId;
      if (!currentPid) throw new Error('No active counter');
      if (playerId !== currentPid) {
        throw new Error(`Not ${playerId}'s turn to count`);
      }

      // Apply this player's hand score now. Pegs move immediately — this is
      // the key to cribbage endgame strategy (whoever reaches 121 first
      // wins, even if later counters would have scored more).
      const pts = pd.handScores?.[currentPid] ?? 0;
      let newPlayers = [...state.players];
      let newScores = { ...pd.scores };
      let gameEnded = false;
      if (pts > 0) {
        const result = addScore(
          { ...state, cribbageBoardState: board },
          { ...pd, scores: newScores },
          currentPid,
          pts,
        );
        newPlayers = result.newPlayers;
        newScores = result.newScores;
        gameEnded = result.gameEnded;
      }

      if (gameEnded) {
        return {
          ...state,
          version: state.version + 1,
          phase: 'ended',
          players: newPlayers,
          currentTurn: null,
          cribbageBoardState: board,
          publicData: {
            ...pd,
            gamePhase: 'ended',
            scores: newScores,
          } as unknown as Record<string, unknown>,
          updatedAt: new Date().toISOString(),
        };
      }

      const order = pd.countOrder ?? [];
      const nextIndex = (pd.countIndex ?? 0) + 1;

      if (nextIndex < order.length) {
        // Advance to the next counter (still in 'hand' step).
        const nextPid = order[nextIndex]!;
        return {
          ...state,
          version: state.version + 1,
          players: newPlayers,
          currentTurn: nextPid,
          cribbageBoardState: board,
          publicData: {
            ...pd,
            countIndex: nextIndex,
            currentCountPlayerId: nextPid,
            scores: newScores,
          } as unknown as Record<string, unknown>,
          updatedAt: new Date().toISOString(),
        };
      }

      // All hands counted — move to the crib step. Dealer counts the crib
      // next. Precompute cribScore for UI display.
      const cribPts = scoreHand(pd.crib, pd.cutCard, true);
      return {
        ...state,
        version: state.version + 1,
        players: newPlayers,
        currentTurn: dealerPid!,
        cribbageBoardState: board,
        publicData: {
          ...pd,
          countingStep: 'crib',
          countIndex: nextIndex,
          currentCountPlayerId: dealerPid,
          scores: newScores,
          cribScore: cribPts,
        } as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      };
    }

    // --- Crib step: dealer counts the crib. ---------------------------------
    if (pd.countingStep === 'crib') {
      if (playerId !== dealerPid) {
        throw new Error('Only the dealer can acknowledge the crib');
      }
      const cribPts = pd.cribScore ?? scoreHand(pd.crib, pd.cutCard, true);
      let newPlayers = [...state.players];
      let newScores = { ...pd.scores };
      let gameEnded = false;
      if (cribPts > 0) {
        const result = addScore(
          { ...state, cribbageBoardState: board },
          { ...pd, scores: newScores },
          dealerPid!,
          cribPts,
        );
        newPlayers = result.newPlayers;
        newScores = result.newScores;
        gameEnded = result.gameEnded;
      }

      if (gameEnded) {
        return {
          ...state,
          version: state.version + 1,
          phase: 'ended',
          players: newPlayers,
          currentTurn: null,
          cribbageBoardState: board,
          publicData: {
            ...pd,
            gamePhase: 'ended',
            scores: newScores,
          } as unknown as Record<string, unknown>,
          updatedAt: new Date().toISOString(),
        };
      }

      // Round complete — deal again.
      return this.startNewRound(state, newPlayers, newScores, board, pd);
    }

    throw new Error(`Unknown countingStep: ${pd.countingStep}`);
  }

  private startNewRound(
    state: GameState,
    players: GameState['players'],
    scores: Record<string, number>,
    board: CribbageBoardState,
    pd: CribbagePublicData,
  ): GameState {
    const newDealerIndex = (pd.dealerIndex + 1) % players.length;
    const deck = createStandardDeck();
    const cards = [...deck.cards];
    shuffle(cards);

    const dealAmt = players.length === 2 ? 6 : 5;
    const newPlayers = players.map((p, idx) => ({
      ...p,
      hand: cards.splice(0, dealAmt).map(c => ({ ...c, faceUp: false })),
      isOut: false,
      isDealer: idx === newDealerIndex,
    }));

    const discardedCount: Record<string, number> = {};
    for (const p of players) discardedCount[p.playerId] = 0;

    const newPublicData: CribbagePublicData = {
      gamePhase: 'discarding',
      crib: [],
      cutCard: null,
      pegCount: 0,
      pegCards: [],
      pegCardPlayers: [],
      pegPlayOrder: players.map(p => p.playerId),
      pegPassedPlayers: [],
      dealerIndex: newDealerIndex,
      scores,
      discardedCount,
      // Explicitly clear counting-phase fields from the previous round.
      scoringHands: undefined,
      countingStep: undefined,
      countOrder: undefined,
      countIndex: undefined,
      currentCountPlayerId: undefined,
      handScores: undefined,
      cribScore: undefined,
    };

    const nonDealerIdx = (newDealerIndex + 1) % players.length;

    return {
      ...state,
      version: state.version + 1,
      phase: 'playing',
      players: newPlayers,
      currentTurn: newPlayers[nonDealerIdx]!.playerId,
      roundNumber: state.roundNumber + 1,
      turnNumber: state.turnNumber + 1,
      cribbageBoardState: board,
      publicData: newPublicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
