/**
 * Whist (Straight / English) — pure game-logic module.
 *
 * 4-player partnership trick-taking. The ancestor of Bridge, Spades,
 * Hearts, and Euchre. No bidding: trump is the suit of the last card
 * dealt to the dealer, who leaves it face-up until their first play.
 * Partnerships score one point per trick taken beyond six. First to 5
 * (short) or 7 (long) points wins. Optional honors (A/K/Q/J of trump)
 * score +4 / +2 to the holding partnership.
 *
 * Deterministic via seeded PRNG. Implements the full ruleset from
 * ./README.md, including:
 *   - Turn-up card mechanic (dealer picks up on first play)
 *   - Optional no-trump variant (skips turn-up)
 *   - Optional honors variant (4-in-hand = 4pt, 3-of-4 = 2pt)
 *   - Multi-hand scoring with dealer rotation
 *   - Rubbers (best-of-3 games) flag
 *
 * Public API:
 *   - newGame(playerIds, config, seed): GameState
 *   - applyAction(state, action): GameState
 *   - legalActions(state, playerId): Action[]
 *   - legalPlayCardIds(state, player): string[]
 *   - getPublicView(state, viewerId): PublicGameState
 */

// ─── PRNG ────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deriveSeed(seed: number, ...tags: number[]): number {
  let s = seed | 0;
  for (const t of tags) {
    s = Math.imul(s ^ t, 0x9e3779b1) | 0;
    s = (s ^ (s >>> 16)) | 0;
  }
  return s | 0;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

// ─── Types ──────────────────────────────────────────────────────────

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7'
  | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

export type PartnershipId = 'NS' | 'EW';

export interface PlayerState {
  id: string;
  seat: 0 | 1 | 2 | 3;
  partnershipId: PartnershipId;
  hand: Card[];
}

export interface Trick {
  ledSuit: Suit | null;
  plays: { playerId: string; card: Card }[];
  winnerId: string | null;
}

export interface Partnership {
  id: PartnershipId;
  playerIds: [string, string];
  score: number;
  tricksThisHand: number;
  /** Games won in the current rubber (0..2). */
  gamesWon: number;
}

export type Phase = 'play' | 'handOver' | 'gameOver';

export type Action =
  | { kind: 'playCard'; playerId: string; cardId: string }
  | { kind: 'ackHand'; playerId: string };

export interface WhistConfig {
  /** Target score to win a game. Default 5 (short whist). */
  targetScore: number;
  /** Count honors (A/K/Q/J of trump) for 4/2 bonus. Default false. */
  countHonors: boolean;
  /** Disable trump entirely. Default false. */
  noTrumpVariant: boolean;
  /** Play best-of-3 games (rubbers). Default false. */
  playRubbers: boolean;
  /** Starting dealer seat index. */
  startingDealerIndex: number;
}

export const DEFAULT_CONFIG: WhistConfig = {
  targetScore: 5,
  countHonors: false,
  noTrumpVariant: false,
  playRubbers: false,
  startingDealerIndex: 3,
};

export interface GameState {
  players: PlayerState[];
  partnerships: Partnership[];
  dealerIndex: number;
  trumpSuit: Suit | null;
  /** The face-up card indicating trump. Null once the dealer has picked it up. */
  turnUpCard: Card | null;
  currentTrick: Trick | null;
  completedTricks: Trick[];
  currentPlayerIndex: number;
  phase: Phase;
  roundNumber: number;
  seed: number;
  config: WhistConfig;
  /**
   * Players who've acked the end-of-hand scoring overlay. Stored as an
   * array (not a Set) because GameState is JSON-round-tripped through
   * Redis on every action; `JSON.stringify(new Set(...))` silently
   * produces `{}`, dropping all elements.
   */
  roundAcks: string[];
  /** True once the dealer has played their first card and taken the turn-up. */
  dealerHasPickedUpTurnUp: boolean;
  /** Winner of the last completed rubber, if any. */
  rubberWinnerId: PartnershipId | null;
}

// ─── Deck + deal ────────────────────────────────────────────────────

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
];

function buildDeck(seed: number, round: number): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  const rng = mulberry32(deriveSeed(seed, round, 0xbead));
  shuffleInPlace(cards, rng);
  return cards;
}

// ─── Setup ──────────────────────────────────────────────────────────

export function newGame(
  playerIds: string[],
  config: Partial<WhistConfig> = {},
  seed = 1,
): GameState {
  if (playerIds.length !== 4) {
    throw new Error('Whist requires exactly 4 players');
  }
  const cfg: WhistConfig = { ...DEFAULT_CONFIG, ...config };

  const players: PlayerState[] = playerIds.map((id, i) => ({
    id,
    seat: i as 0 | 1 | 2 | 3,
    partnershipId: i % 2 === 0 ? 'NS' : 'EW',
    hand: [],
  }));

  const partnerships: Partnership[] = [
    { id: 'NS', playerIds: [players[0]!.id, players[2]!.id], score: 0, tricksThisHand: 0, gamesWon: 0 },
    { id: 'EW', playerIds: [players[1]!.id, players[3]!.id], score: 0, tricksThisHand: 0, gamesWon: 0 },
  ];

  return dealHand({
    players,
    partnerships,
    dealerIndex: cfg.startingDealerIndex % 4,
    trumpSuit: null,
    turnUpCard: null,
    currentTrick: null,
    completedTricks: [],
    currentPlayerIndex: 0,
    phase: 'play',
    roundNumber: 1,
    seed,
    config: cfg,
    roundAcks: [],
    dealerHasPickedUpTurnUp: false,
    rubberWinnerId: null,
  });
}

function dealHand(state: GameState): GameState {
  const deck = buildDeck(state.seed, state.roundNumber);
  const players = state.players.map((p) => ({ ...p, hand: [] as Card[] }));
  let idx = 0;
  for (let i = 0; i < 13; i++) {
    for (const p of players) {
      p.hand.push(deck[idx++]!);
    }
  }
  // Turn-up: the last card dealt to the dealer. In Whist the dealer is
  // the final seat in the deal order; their 13th card (index 12) is
  // face-up until they play their first card.
  const dealerHand = players[state.dealerIndex]!.hand;
  const turnUpCard = state.config.noTrumpVariant ? null : dealerHand[dealerHand.length - 1]!;
  const trumpSuit = state.config.noTrumpVariant ? null : turnUpCard!.suit;

  return {
    ...state,
    players,
    trumpSuit,
    turnUpCard,
    currentTrick: { ledSuit: null, plays: [], winnerId: null },
    completedTricks: [],
    currentPlayerIndex: (state.dealerIndex + 1) % 4,
    phase: 'play',
    roundAcks: [],
    dealerHasPickedUpTurnUp: false,
    partnerships: state.partnerships.map((pa) => ({ ...pa, tricksThisHand: 0 })),
  };
}

// ─── Play ──────────────────────────────────────────────────────────

export function legalPlayCardIds(state: GameState, player: PlayerState): string[] {
  if (state.phase !== 'play' || !state.currentTrick) return [];
  const trick = state.currentTrick;
  if (trick.plays.length === 0) {
    return player.hand.map((c) => c.id);
  }
  const led = trick.ledSuit;
  if (led) {
    const followable = player.hand.filter((c) => c.suit === led);
    if (followable.length > 0) return followable.map((c) => c.id);
  }
  return player.hand.map((c) => c.id);
}

function cardTrickValue(card: Card, ledSuit: Suit | null, trump: Suit | null): number {
  if (trump && card.suit === trump) return 1000 + RANK_VALUE[card.rank];
  if (ledSuit && card.suit === ledSuit) return RANK_VALUE[card.rank];
  return 0;
}

function applyPlayCard(
  state: GameState,
  a: Extract<Action, { kind: 'playCard' }>,
): GameState {
  if (state.phase !== 'play') throw new Error('Not in play phase');
  const current = state.players[state.currentPlayerIndex]!;
  if (current.id !== a.playerId) throw new Error(`Not ${a.playerId}'s turn`);
  const card = current.hand.find((c) => c.id === a.cardId);
  if (!card) throw new Error(`Card ${a.cardId} not in hand`);
  const legal = legalPlayCardIds(state, current);
  if (!legal.includes(a.cardId)) throw new Error('Must follow the led suit');

  const trick = state.currentTrick!;
  const ledSuit: Suit | null = trick.plays.length === 0 ? card.suit : trick.ledSuit;
  const newPlays = [...trick.plays, { playerId: current.id, card }];
  const players = state.players.map((p) =>
    p.id === current.id ? { ...p, hand: p.hand.filter((c) => c.id !== a.cardId) } : p,
  );

  // Track dealer's turn-up pickup: once the dealer plays any card, the
  // turn-up card is deemed "picked up" (it's already in their hand — the
  // flag just hides it from public view).
  let dealerHasPickedUpTurnUp = state.dealerHasPickedUpTurnUp;
  let turnUpCard = state.turnUpCard;
  if (current.seat === state.dealerIndex && !dealerHasPickedUpTurnUp) {
    dealerHasPickedUpTurnUp = true;
    turnUpCard = null;
  }

  if (newPlays.length < 4) {
    return {
      ...state,
      players,
      currentTrick: { ledSuit, plays: newPlays, winnerId: null },
      currentPlayerIndex: (state.currentPlayerIndex + 1) % 4,
      dealerHasPickedUpTurnUp,
      turnUpCard,
    };
  }

  // Trick complete — resolve.
  const winnerEntry = newPlays.reduce((best, p) =>
    cardTrickValue(p.card, ledSuit, state.trumpSuit)
      > cardTrickValue(best.card, ledSuit, state.trumpSuit) ? p : best,
  );
  const winnerIdx = players.findIndex((p) => p.id === winnerEntry.playerId);
  const winnerPartnership = players[winnerIdx]!.partnershipId;
  const partnerships = state.partnerships.map((pa) =>
    pa.id === winnerPartnership
      ? { ...pa, tricksThisHand: pa.tricksThisHand + 1 }
      : pa,
  );
  const completedTricks = [...state.completedTricks, {
    ledSuit, plays: newPlays, winnerId: winnerEntry.playerId,
  }];

  const handsEmpty = players.every((p) => p.hand.length === 0);
  if (handsEmpty) {
    return scoreHand(
      {
        ...state,
        players, partnerships,
        completedTricks,
        currentTrick: null,
        currentPlayerIndex: winnerIdx,
        dealerHasPickedUpTurnUp,
        turnUpCard,
      },
    );
  }
  return {
    ...state,
    players, partnerships,
    completedTricks,
    currentTrick: { ledSuit: null, plays: [], winnerId: null },
    currentPlayerIndex: winnerIdx,
    dealerHasPickedUpTurnUp,
    turnUpCard,
  };
}

// ─── Scoring ────────────────────────────────────────────────────────

function scoreHand(state: GameState): GameState {
  let partnerships = state.partnerships.map((pa) => {
    const over = Math.max(0, pa.tricksThisHand - 6);
    return { ...pa, score: pa.score + over };
  });

  if (state.config.countHonors && !state.config.noTrumpVariant && state.trumpSuit) {
    partnerships = applyHonors(state, partnerships);
  }

  // Check for game end.
  const target = state.config.targetScore;
  const winner = partnerships.find((pa) => pa.score >= target);
  if (winner) {
    if (state.config.playRubbers) {
      const updated = partnerships.map((pa) =>
        pa.id === winner.id
          ? { ...pa, gamesWon: pa.gamesWon + 1, score: 0 }
          : { ...pa, score: 0 },
      );
      const rubberWinner = updated.find((pa) => pa.gamesWon >= 2);
      if (rubberWinner) {
        return {
          ...state,
          partnerships: updated,
          phase: 'gameOver',
          rubberWinnerId: rubberWinner.id,
        };
      }
      // Rubber continues: next game.
      return { ...state, partnerships: updated, phase: 'handOver' };
    }
    return { ...state, partnerships, phase: 'gameOver' };
  }
  return { ...state, partnerships, phase: 'handOver' };
}

function applyHonors(
  state: GameState,
  partnerships: Partnership[],
): Partnership[] {
  const honorsByPartnership: Record<PartnershipId, number> = { NS: 0, EW: 0 };
  const honorRanks: Rank[] = ['A', 'K', 'Q', 'J'];
  for (const trick of state.completedTricks) {
    for (const pl of trick.plays) {
      if (pl.card.suit !== state.trumpSuit) continue;
      if (!honorRanks.includes(pl.card.rank)) continue;
      const player = state.players.find((p) => p.id === pl.playerId);
      if (!player) continue;
      honorsByPartnership[player.partnershipId] += 1;
    }
  }
  // Also look in remaining hands + turn-up card (but hands are empty at scoring time).
  return partnerships.map((pa) => {
    const count = honorsByPartnership[pa.id];
    if (count === 4) return { ...pa, score: pa.score + 4 };
    if (count === 3) return { ...pa, score: pa.score + 2 };
    return pa;
  });
}

// ─── applyAckHand ──────────────────────────────────────────────────

function applyAckHand(
  state: GameState,
  a: Extract<Action, { kind: 'ackHand' }>,
): GameState {
  if (state.phase !== 'handOver') throw new Error('No hand to ack');
  const acks = state.roundAcks.includes(a.playerId)
    ? state.roundAcks
    : [...state.roundAcks, a.playerId];
  if (acks.length < 4) return { ...state, roundAcks: acks };
  return startNextHand({ ...state, roundAcks: acks });
}

export function startNextHand(state: GameState): GameState {
  const dealerIndex = (state.dealerIndex + 1) % 4;
  return dealHand({
    ...state,
    dealerIndex,
    roundNumber: state.roundNumber + 1,
  });
}

// ─── legalActions + applyAction ───────────────────────────────────

export function legalActions(state: GameState, playerId: string): Action[] {
  if (state.phase === 'gameOver') return [];
  if (state.phase === 'handOver') {
    if (state.roundAcks.includes(playerId)) return [];
    return [{ kind: 'ackHand', playerId }];
  }
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) return [];
  const ids = legalPlayCardIds(state, current);
  return ids.map((cardId) => ({ kind: 'playCard', playerId, cardId }));
}

export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase === 'gameOver') throw new Error('Game is over');
  switch (action.kind) {
    case 'playCard': return applyPlayCard(state, action);
    case 'ackHand':  return applyAckHand(state, action);
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ─── Public view ───────────────────────────────────────────────────

export interface PublicPlayerView {
  id: string;
  seat: number;
  partnershipId: PartnershipId;
  handCount: number;
}

export interface PublicGameState {
  players: PublicPlayerView[];
  partnerships: Partnership[];
  viewerHand: Card[] | null;
  dealerIndex: number;
  trumpSuit: Suit | null;
  turnUpCard: Card | null;
  currentTrick: Trick | null;
  currentPlayerId: string | null;
  phase: Phase;
  roundNumber: number;
}

export function getPublicView(state: GameState, viewerId: string): PublicGameState {
  return {
    players: state.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      partnershipId: p.partnershipId,
      handCount: p.hand.length,
    })),
    partnerships: state.partnerships,
    viewerHand: state.players.find((p) => p.id === viewerId)?.hand ?? null,
    dealerIndex: state.dealerIndex,
    trumpSuit: state.trumpSuit,
    turnUpCard: state.turnUpCard,
    currentTrick: state.currentTrick,
    currentPlayerId:
      state.phase === 'gameOver' || state.phase === 'handOver'
        ? null
        : (state.players[state.currentPlayerIndex]?.id ?? null),
    phase: state.phase,
    roundNumber: state.roundNumber,
  };
}
