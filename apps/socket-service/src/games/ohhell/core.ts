/**
 * Oh Hell! (a.k.a. Blackout / Nomination Whist / Up the River) —
 * pure game-logic module.
 *
 * 3–7 players, standard 52-card deck, individual play. Each round has
 * a fixed hand size defined by an "arc" — canonically 1 → M → 1 where
 * M = floor(51/N) leaves room for the trump turn-up. Players bid the
 * exact number of tricks they expect; exact bids score, misses score
 * zero. The dealer bids last and under the canonical "hook rule" may
 * not bid a value that would make the sum of bids equal the number
 * of tricks — guaranteeing at least one miss per round.
 *
 * Deterministic via seeded PRNG. Implements the full ruleset from
 * ./README.md, including:
 *   - Four arc shapes: `up`, `down`, `upDown` (default), `downUp`
 *   - Configurable hook rule (`dealerBlocked` / `noHook`)
 *   - Optional no-trump on the 1-card round (default true)
 *   - Three scoring modes: `standard`, `overUnder`, `penalty`
 *   - Zero-bid score variants: `flat10` / `5PlusRound`
 *   - Optional 1–2 jokers as "always-highest trump"
 *
 * Public API:
 *   - newGame(playerIds, config, seed): GameState
 *   - applyAction(state, action): GameState
 *   - legalActions(state, playerId): Action[]
 *   - getPublicView(state, viewerId): PublicGameState
 *   - arcRounds(playerCount, arc): number[] — handSize per round
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
  /** True for joker cards (unranked, unsuited, always highest trump). */
  joker?: boolean;
}

const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

/** Jokers rank above 14 (the Ace). Higher value jokers out-trump lower ones. */
const JOKER_VALUE = 100;

export interface PlayerState {
  id: string;
  seat: number;
  hand: Card[];
  /** Current round's bid; null until placed. */
  bid: number | null;
  tricksWon: number;
  scoreTotal: number;
}

export interface Trick {
  ledSuit: Suit | null;
  plays: { playerId: string; card: Card }[];
  winnerId: string | null;
}

export type Phase = 'bid' | 'play' | 'roundOver' | 'gameOver';

export type Action =
  | { kind: 'placeBid'; playerId: string; bid: number }
  | { kind: 'playCard'; playerId: string; cardId: string }
  | { kind: 'ackRound'; playerId: string };

export type HandArc = 'up' | 'down' | 'upDown' | 'downUp';
export type ScoringMode = 'standard' | 'overUnder' | 'penalty';
export type HookRule = 'dealerBlocked' | 'noHook';
export type ZeroBidScore = 'flat10' | '5PlusRound';

export interface OhHellConfig {
  handArc: HandArc;
  hookRule: HookRule;
  lastRoundNoTrump: boolean;
  scoringMode: ScoringMode;
  zeroBidScore: ZeroBidScore;
  /** 0, 1, or 2 jokers added to the deck (ranking above Ace of trump). */
  jokers: 0 | 1 | 2;
  /** Whether opponent bids are visible as they're placed (UX only). */
  bidsVisible: boolean;
  /** Fixed bonus on exact bids for `standard` mode (default 10). */
  fixedWinBonus: number;
  /** Seat index of the round-1 dealer. Subsequent rounds rotate +1. */
  startingDealerIndex: number;
}

export const DEFAULT_CONFIG: OhHellConfig = {
  handArc: 'upDown',
  hookRule: 'dealerBlocked',
  lastRoundNoTrump: true,
  scoringMode: 'standard',
  zeroBidScore: 'flat10',
  jokers: 0,
  bidsVisible: true,
  fixedWinBonus: 10,
  startingDealerIndex: 0,
};

export interface GameState {
  players: PlayerState[];
  dealerIndex: number;
  roundNumber: number;
  /** Flat list of every round's handSize — the arc, frozen at newGame(). */
  rounds: number[];
  handSize: number;
  trumpSuit: Suit | null;
  turnUpCard: Card | null;
  currentTrick: Trick | null;
  completedTricksThisRound: Trick[];
  currentPlayerIndex: number;
  phase: Phase;
  /**
   * Per-round ack tracker. Once the UI has shown scores for a round,
   * each player acknowledges; when all have acked we advance to the
   * next round. Gracefully falls back to auto-advance if the adapter
   * doesn't surface ack actions.
   */
  roundAcks: Set<string>;
  seed: number;
  config: OhHellConfig;
}

// ─── Arc & deck helpers ─────────────────────────────────────────────

/** Max hand size = floor(51/N) so at least one card remains for the turn-up. */
export function maxHandSize(playerCount: number, jokers: 0 | 1 | 2 = 0): number {
  return Math.floor((51 + jokers) / playerCount);
}

/** Hand size per round for the given arc. */
export function arcRounds(playerCount: number, arc: HandArc, jokers: 0 | 1 | 2 = 0): number[] {
  const M = maxHandSize(playerCount, jokers);
  if (M < 1) return [];
  switch (arc) {
    case 'up':
      return Array.from({ length: M }, (_, i) => i + 1);
    case 'down':
      return Array.from({ length: M }, (_, i) => M - i);
    case 'upDown': {
      const up = Array.from({ length: M }, (_, i) => i + 1);
      const down = Array.from({ length: M - 1 }, (_, i) => M - 1 - i);
      return [...up, ...down];
    }
    case 'downUp': {
      const down = Array.from({ length: M }, (_, i) => M - i);
      const up = Array.from({ length: M - 1 }, (_, i) => i + 2);
      return [...down, ...up];
    }
  }
}

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
];

function buildDeck(cfg: OhHellConfig, seed: number, round: number): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  for (let j = 0; j < cfg.jokers; j++) {
    cards.push({ suit: 'S', rank: 'A', id: `J${j + 1}`, joker: true });
  }
  const rng = mulberry32(deriveSeed(seed, round, 0xf00d));
  shuffleInPlace(cards, rng);
  return cards;
}

// ─── Setup ──────────────────────────────────────────────────────────

export function newGame(
  playerIds: string[],
  config: Partial<OhHellConfig> = {},
  seed = 1,
): GameState {
  if (playerIds.length < 3 || playerIds.length > 7) {
    throw new Error('Oh Hell requires 3–7 players');
  }
  const cfg: OhHellConfig = { ...DEFAULT_CONFIG, ...config };
  const rounds = arcRounds(playerIds.length, cfg.handArc, cfg.jokers);
  if (rounds.length === 0) throw new Error('No rounds in arc — invalid config');

  const players: PlayerState[] = playerIds.map((id, seat) => ({
    id, seat,
    hand: [], bid: null, tricksWon: 0, scoreTotal: 0,
  }));

  return dealRound(
    {
      players,
      dealerIndex: cfg.startingDealerIndex % playerIds.length,
      roundNumber: 1,
      rounds,
      handSize: rounds[0]!,
      trumpSuit: null,
      turnUpCard: null,
      currentTrick: null,
      completedTricksThisRound: [],
      currentPlayerIndex: 0,
      phase: 'bid',
      roundAcks: new Set(),
      seed,
      config: cfg,
    },
    rounds[0]!,
  );
}

function dealRound(state: GameState, handSize: number): GameState {
  const deck = buildDeck(state.config, state.seed, state.roundNumber);
  const players = state.players.map((p) => ({
    ...p,
    hand: [] as Card[],
    bid: null,
    tricksWon: 0,
  }));

  let idx = 0;
  for (let i = 0; i < handSize; i++) {
    for (const p of players) {
      p.hand.push(deck[idx++]!);
    }
  }

  let turnUpCard: Card | null = null;
  let trumpSuit: Suit | null = null;
  if (idx < deck.length) {
    turnUpCard = deck[idx]!;
    trumpSuit = turnUpCard.joker ? null : turnUpCard.suit;
  }

  // Canonical: 1-card round becomes no-trump when configured.
  const isLastRoundSingle = handSize === 1;
  if (state.config.lastRoundNoTrump && isLastRoundSingle) {
    trumpSuit = null;
  }

  // Bidder leader = seat immediately left of dealer (dealer bids last).
  const firstBidderIndex = (state.dealerIndex + 1) % players.length;

  return {
    ...state,
    players,
    handSize,
    trumpSuit,
    turnUpCard,
    currentTrick: null,
    completedTricksThisRound: [],
    currentPlayerIndex: firstBidderIndex,
    phase: 'bid',
    roundAcks: new Set(),
  };
}

// ─── Bidding ────────────────────────────────────────────────────────

/** Returns bids forbidden to the current bidder under the hook rule. */
export function forbiddenBids(state: GameState): number[] {
  if (state.phase !== 'bid') return [];
  if (state.config.hookRule !== 'dealerBlocked') return [];
  const current = state.players[state.currentPlayerIndex]!;
  // Only the dealer — who bids last — is ever forbidden anything.
  if (current.seat !== state.dealerIndex) return [];
  // Has anyone yet to bid besides the dealer?
  const othersBid = state.players.filter((p) => p.id !== current.id).every((p) => p.bid !== null);
  if (!othersBid) return [];
  const sumOthers = state.players
    .filter((p) => p.id !== current.id)
    .reduce((s, p) => s + (p.bid ?? 0), 0);
  const forbidden = state.handSize - sumOthers;
  if (forbidden < 0 || forbidden > state.handSize) return [];
  return [forbidden];
}

export function legalBids(state: GameState): number[] {
  if (state.phase !== 'bid') return [];
  const forbidden = new Set(forbiddenBids(state));
  const out: number[] = [];
  for (let b = 0; b <= state.handSize; b++) if (!forbidden.has(b)) out.push(b);
  return out;
}

function applyPlaceBid(
  state: GameState,
  a: Extract<Action, { kind: 'placeBid' }>,
): GameState {
  if (state.phase !== 'bid') throw new Error('Not in bid phase');
  const current = state.players[state.currentPlayerIndex]!;
  if (current.id !== a.playerId) throw new Error(`Not ${a.playerId}'s turn to bid`);
  if (!Number.isInteger(a.bid) || a.bid < 0 || a.bid > state.handSize) {
    throw new Error(`Bid ${a.bid} out of range 0..${state.handSize}`);
  }
  if (forbiddenBids(state).includes(a.bid)) {
    throw new Error(`Hook rule: dealer may not bid ${a.bid}`);
  }
  const players = state.players.map((p) => (p.id === a.playerId ? { ...p, bid: a.bid } : p));
  const allBid = players.every((p) => p.bid !== null);
  if (allBid) {
    // Play starts with the seat immediately left of dealer.
    return {
      ...state,
      players,
      phase: 'play',
      currentPlayerIndex: (state.dealerIndex + 1) % players.length,
      currentTrick: { ledSuit: null, plays: [], winnerId: null },
    };
  }
  return {
    ...state,
    players,
    currentPlayerIndex: (state.currentPlayerIndex + 1) % players.length,
  };
}

// ─── Play (tricks) ──────────────────────────────────────────────────

function cardIsTrump(card: Card, trump: Suit | null): boolean {
  if (card.joker) return true;
  if (trump === null) return false;
  return card.suit === trump;
}

function cardTrickValue(card: Card, ledSuit: Suit | null, trump: Suit | null): number {
  if (card.joker) return JOKER_VALUE;
  if (trump && card.suit === trump) return 1000 + RANK_VALUE[card.rank];
  if (ledSuit && card.suit === ledSuit) return RANK_VALUE[card.rank];
  return 0; // off-suit, non-trump — never wins
}

export function legalPlayCardIds(state: GameState, player: PlayerState): string[] {
  if (state.phase !== 'play') return [];
  if (!state.currentTrick) return [];
  const led = state.currentTrick.ledSuit;
  if (!led) return player.hand.map((c) => c.id);
  // Jokers "count as trump" for leading purposes. For follow-suit we treat
  // a joker as having no suit — if the player has cards of the led suit
  // they must follow; otherwise jokers and any other card are legal.
  const followable = player.hand.filter((c) => !c.joker && c.suit === led);
  if (followable.length > 0) return followable.map((c) => c.id);
  return player.hand.map((c) => c.id);
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
  if (!legal.includes(a.cardId)) {
    throw new Error('Must follow the led suit');
  }

  const trick = state.currentTrick!;
  const ledSuit: Suit | null = trick.plays.length === 0
    ? (card.joker ? (state.trumpSuit ?? null) : card.suit)
    : trick.ledSuit;
  const newPlays = [...trick.plays, { playerId: current.id, card }];
  const players = state.players.map((p) =>
    p.id === current.id ? { ...p, hand: p.hand.filter((c) => c.id !== a.cardId) } : p,
  );
  // Joker-led counts as trump being led; bookkeeping only. For the
  // trick resolution we still use `ledSuit` for non-trump comparisons.

  const trickFull = newPlays.length === state.players.length;
  if (!trickFull) {
    return {
      ...state,
      players,
      currentTrick: { ledSuit, plays: newPlays, winnerId: null },
      currentPlayerIndex: (state.currentPlayerIndex + 1) % players.length,
    };
  }
  // Resolve the trick.
  const winnerEntry = newPlays.reduce((best, p) =>
    cardTrickValue(p.card, ledSuit, state.trumpSuit)
      > cardTrickValue(best.card, ledSuit, state.trumpSuit) ? p : best,
  );
  const winnerPlayers = players.map((p) =>
    p.id === winnerEntry.playerId ? { ...p, tricksWon: p.tricksWon + 1 } : p,
  );
  const completedTrick: Trick = {
    ledSuit, plays: newPlays, winnerId: winnerEntry.playerId,
  };
  const completed = [...state.completedTricksThisRound, completedTrick];
  const handsEmpty = winnerPlayers.every((p) => p.hand.length === 0);
  if (handsEmpty) {
    // Score the round, advance phase, maybe end the game.
    const { scored, gameOver } = scoreRound(
      state, winnerPlayers,
    );
    return {
      ...state,
      players: scored,
      completedTricksThisRound: completed,
      currentTrick: null,
      currentPlayerIndex: state.players.findIndex((p) => p.id === winnerEntry.playerId),
      phase: gameOver ? 'gameOver' : 'roundOver',
    };
  }
  const winnerIdx = winnerPlayers.findIndex((p) => p.id === winnerEntry.playerId);
  return {
    ...state,
    players: winnerPlayers,
    completedTricksThisRound: completed,
    currentTrick: { ledSuit: null, plays: [], winnerId: null },
    currentPlayerIndex: winnerIdx,
  };
}

function scoreRound(
  state: GameState,
  players: PlayerState[],
): { scored: PlayerState[]; gameOver: boolean } {
  const scored = players.map((p) => {
    const delta = scoreForPlayer(state, p);
    return { ...p, scoreTotal: p.scoreTotal + delta };
  });
  const gameOver = state.roundNumber >= state.rounds.length;
  return { scored, gameOver };
}

export function scoreForPlayer(state: GameState, p: PlayerState): number {
  const bid = p.bid ?? 0;
  const taken = p.tricksWon;
  const exact = bid === taken;
  const diff = Math.abs(bid - taken);
  const cfg = state.config;
  // Zero-bid made exactly: custom formula.
  if (exact && bid === 0) {
    return cfg.zeroBidScore === 'flat10' ? 10 : 5 + state.roundNumber;
  }
  if (cfg.scoringMode === 'standard') {
    return exact ? cfg.fixedWinBonus + bid : 0;
  }
  if (cfg.scoringMode === 'overUnder') {
    if (exact) return cfg.fixedWinBonus + bid;
    if (diff === 1) return 5;
    return 0;
  }
  // penalty
  if (exact) return bid;
  return -diff;
}

function applyAckRound(
  state: GameState,
  a: Extract<Action, { kind: 'ackRound' }>,
): GameState {
  if (state.phase !== 'roundOver') throw new Error('No round to ack');
  const acks = new Set(state.roundAcks);
  acks.add(a.playerId);
  if (acks.size < state.players.length) {
    return { ...state, roundAcks: acks };
  }
  return startNextRound({ ...state, roundAcks: acks });
}

export function startNextRound(state: GameState): GameState {
  if (state.roundNumber >= state.rounds.length) {
    return { ...state, phase: 'gameOver' };
  }
  const nextRound = state.roundNumber + 1;
  const dealerIndex = (state.dealerIndex + 1) % state.players.length;
  const nextHand = state.rounds[nextRound - 1]!;
  return dealRound(
    { ...state, roundNumber: nextRound, dealerIndex },
    nextHand,
  );
}

// ─── legalActions + applyAction + public view ───────────────────────

export function legalActions(state: GameState, playerId: string): Action[] {
  if (state.phase === 'gameOver') return [];
  if (state.phase === 'roundOver') {
    if (state.roundAcks.has(playerId)) return [];
    return [{ kind: 'ackRound', playerId }];
  }
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) return [];
  if (state.phase === 'bid') {
    return legalBids(state).map((bid) => ({ kind: 'placeBid', playerId, bid }));
  }
  const ids = legalPlayCardIds(state, current);
  return ids.map((cardId) => ({ kind: 'playCard', playerId, cardId }));
}

export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase === 'gameOver') throw new Error('Game is over');
  switch (action.kind) {
    case 'placeBid': return applyPlaceBid(state, action);
    case 'playCard': return applyPlayCard(state, action);
    case 'ackRound': return applyAckRound(state, action);
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export interface PublicPlayerView {
  id: string;
  seat: number;
  handCount: number;
  bid: number | null;
  tricksWon: number;
  scoreTotal: number;
}

export interface PublicGameState {
  players: PublicPlayerView[];
  viewerHand: Card[] | null;
  dealerIndex: number;
  roundNumber: number;
  rounds: number[];
  handSize: number;
  trumpSuit: Suit | null;
  turnUpCard: Card | null;
  currentTrick: Trick | null;
  currentPlayerId: string | null;
  phase: Phase;
  forbiddenBids: number[];
}

export function getPublicView(state: GameState, viewerId: string): PublicGameState {
  return {
    players: state.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      handCount: p.hand.length,
      bid: state.config.bidsVisible || p.id === viewerId ? p.bid : null,
      tricksWon: p.tricksWon,
      scoreTotal: p.scoreTotal,
    })),
    viewerHand: state.players.find((p) => p.id === viewerId)?.hand ?? null,
    dealerIndex: state.dealerIndex,
    roundNumber: state.roundNumber,
    rounds: state.rounds,
    handSize: state.handSize,
    trumpSuit: state.trumpSuit,
    turnUpCard: state.turnUpCard,
    currentTrick: state.currentTrick,
    currentPlayerId: state.phase === 'gameOver'
      ? null
      : (state.players[state.currentPlayerIndex]?.id ?? null),
    phase: state.phase,
    forbiddenBids: forbiddenBids(state),
  };
}
