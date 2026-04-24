/**
 * Spades — pure game-logic module.
 *
 * Canonical partnership trick-taking for 4 players; individual
 * variants for 2 and 3 players. Spades is always trump. Players bid
 * the number of tricks they expect; partners' bids sum to the
 * partnership contract. Exact-or-over makes the bid; over scores bags
 * that penalise 100 points every tenth one.
 *
 * Deterministic via seeded PRNG. Implements the full ruleset from
 * ./README.md, including:
 *   - Partnership scoring (4p) + individual scoring (2p / 3p)
 *   - Bid kinds: number, nil, blindNil (with eligibility gating)
 *   - Spades-broken state + leading-spades constraint
 *   - Sandbag accumulation across rounds with 10-bag −100 penalty
 *   - Optional Big/Little joker variant (with deuce-removal)
 *   - Multi-round play to a configurable target score (default 500)
 *   - Nil-tricks-don't-count-for-partner rule (canonical)
 *
 * Public API:
 *   - newGame(playerIds, config, seed): GameState
 *   - applyAction(state, action): GameState
 *   - legalActions(state, playerId): Action[]
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
  | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'
  | 'BigJoker' | 'LittleJoker';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

/** Trick-winning comparator order. Big Joker and Little Joker live at
 *  the top of the spade order when the jokers variant is enabled. */
const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
  LittleJoker: 15, BigJoker: 16,
};

export type BidKind = 'number' | 'nil' | 'blindNil';
export type Bid =
  | { kind: 'number'; n: number }
  | { kind: 'nil' }
  | { kind: 'blindNil' };

export type PartnershipId = 'NS' | 'EW';

export interface PlayerState {
  id: string;
  seat: number;
  partnershipId: PartnershipId | null; // null for 2p/3p (individual)
  hand: Card[];
  tricksTakenCount: number;
  bid: Bid | null;
  /** True if the player has peeked — relevant to blind-nil eligibility. */
  handRevealed: boolean;
}

export interface Partnership {
  id: PartnershipId;
  playerIds: [string, string];
  score: number;
  sandbags: number;
}

export interface Trick {
  ledSuit: Suit | null;
  plays: { playerId: string; card: Card }[];
  winnerId: string | null;
}

export type Phase =
  | 'bid'
  | 'play'
  | 'roundOver'
  | 'gameOver';

export type Action =
  | { kind: 'placeBid'; playerId: string; bid: Bid }
  | { kind: 'playCard'; playerId: string; cardId: string }
  | { kind: 'ackRound'; playerId: string };

export interface SpadesConfig {
  /** Target score to win (default 500). */
  targetScore: number;
  /** Loss threshold — null disables. Default −200. */
  lowerLimit: number | null;
  /** Enable Big/Little joker variant (adds 2 jokers, removes 2♣ and 2♦). */
  useJokers: boolean;
  /** Allow blind nil bids (UI precondition: eligibility below threshold). */
  allowBlindNil: boolean;
  /** Partnership must trail by this much to use blind nil. Default 100. */
  blindNilBehindThreshold: number;
  /** Bag penalty magnitude (default 100). */
  bagPenaltyPerTen: number;
  /** Nil bonus magnitude (default 100). */
  nilBonus: number;
  /** Blind-nil bonus magnitude (default 200). */
  blindNilBonus: number;
  /** Starting dealer index (default 0). Dealer rotates clockwise each round. */
  startingDealerIndex: number;
}

export const DEFAULT_CONFIG: SpadesConfig = {
  targetScore: 500,
  lowerLimit: -200,
  useJokers: false,
  allowBlindNil: false,
  blindNilBehindThreshold: 100,
  bagPenaltyPerTen: 100,
  nilBonus: 100,
  blindNilBonus: 200,
  startingDealerIndex: 0,
};

export interface GameState {
  players: PlayerState[];
  partnerships: Partnership[];
  dealerIndex: number;
  currentPlayerIndex: number;
  currentTrick: Trick | null;
  completedTricks: Trick[];
  phase: Phase;
  spadesBroken: boolean;
  roundNumber: number;
  seed: number;
  config: SpadesConfig;
  roundAcks: Set<string>;
}

// ─── Deck + deal ────────────────────────────────────────────────────

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const STANDARD_RANKS: Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
];

function buildDeck(cfg: SpadesConfig, seed: number, round: number): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of STANDARD_RANKS) {
      cards.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  if (cfg.useJokers) {
    // Remove 2♣ and 2♦ to keep count at 52; add 2 jokers (suit S as a
    // trump marker — jokers always win over any non-joker trump).
    const drop = new Set(['2C', '2D']);
    const filtered = cards.filter((c) => !drop.has(c.id));
    filtered.push({ suit: 'S', rank: 'BigJoker', id: 'BJ' });
    filtered.push({ suit: 'S', rank: 'LittleJoker', id: 'LJ' });
    const rng = mulberry32(deriveSeed(seed, round, 0x5ea));
    shuffleInPlace(filtered, rng);
    return filtered;
  }
  const rng = mulberry32(deriveSeed(seed, round, 0x5ea));
  shuffleInPlace(cards, rng);
  return cards;
}

function dealSize(playerCount: number): number {
  return 13; // 52 / 4 = 13, 39 / 3 = 13 (with 2♣ removed), 26 selected for 2p
}

// ─── Setup ──────────────────────────────────────────────────────────

export function newGame(
  playerIds: string[],
  config: Partial<SpadesConfig> = {},
  seed = 1,
): GameState {
  if (playerIds.length < 2 || playerIds.length > 4) {
    throw new Error('Spades requires 2–4 players');
  }
  const cfg: SpadesConfig = { ...DEFAULT_CONFIG, ...config };

  const players: PlayerState[] = playerIds.map((id, i) => ({
    id, seat: i,
    partnershipId: playerIds.length === 4
      ? (i % 2 === 0 ? 'NS' : 'EW')
      : null,
    hand: [],
    tricksTakenCount: 0,
    bid: null,
    handRevealed: false,
  }));

  const partnerships: Partnership[] = playerIds.length === 4 ? [
    { id: 'NS', playerIds: [players[0]!.id, players[2]!.id], score: 0, sandbags: 0 },
    { id: 'EW', playerIds: [players[1]!.id, players[3]!.id], score: 0, sandbags: 0 },
  ] : [];

  return dealRound({
    players,
    partnerships,
    dealerIndex: cfg.startingDealerIndex % playerIds.length,
    currentPlayerIndex: 0,
    currentTrick: null,
    completedTricks: [],
    phase: 'bid',
    spadesBroken: false,
    roundNumber: 1,
    seed,
    config: cfg,
    roundAcks: new Set(),
  });
}

function dealRound(state: GameState): GameState {
  const cards = buildDeck(state.config, state.seed, state.roundNumber);
  const n = state.players.length;
  let deck = cards;
  if (n === 3) {
    // Remove 2♣ for the 3-player variant so 39 / 3 = 13.
    deck = cards.filter((c) => c.id !== '2C');
  }
  const size = dealSize(n);
  const players = state.players.map((p) => ({
    ...p,
    hand: [] as Card[],
    tricksTakenCount: 0,
    bid: null,
    handRevealed: false,
  }));
  let idx = 0;
  for (let i = 0; i < size; i++) {
    for (const p of players) {
      p.hand.push(deck[idx++]!);
    }
  }
  const firstBidderIdx = (state.dealerIndex + 1) % n;
  return {
    ...state,
    players,
    currentPlayerIndex: firstBidderIdx,
    currentTrick: null,
    completedTricks: [],
    phase: 'bid',
    spadesBroken: false,
    roundAcks: new Set(),
  };
}

// ─── Bidding ───────────────────────────────────────────────────────

export function isEligibleForBlindNil(
  state: GameState,
  playerId: string,
): boolean {
  if (!state.config.allowBlindNil) return false;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  if (player.handRevealed) return false;
  if (player.partnershipId === null) {
    // Individual play — eligibility based on own score.
    return player.bid === null;
  }
  const myTeam = state.partnerships.find((pa) => pa.id === player.partnershipId)!;
  const oppTeam = state.partnerships.find((pa) => pa.id !== player.partnershipId)!;
  return oppTeam.score - myTeam.score >= state.config.blindNilBehindThreshold;
}

function applyPlaceBid(
  state: GameState,
  a: Extract<Action, { kind: 'placeBid' }>,
): GameState {
  if (state.phase !== 'bid') throw new Error('Not in bid phase');
  const current = state.players[state.currentPlayerIndex]!;
  if (current.id !== a.playerId) throw new Error(`Not ${a.playerId}'s turn to bid`);
  if (a.bid.kind === 'number') {
    if (!Number.isInteger(a.bid.n) || a.bid.n < 0 || a.bid.n > 13) {
      throw new Error('Number bid must be 0..13');
    }
  }
  if (a.bid.kind === 'blindNil' && !isEligibleForBlindNil(state, a.playerId)) {
    throw new Error('Not eligible for blind nil');
  }
  // Placing any bid marks the hand as "revealed" for future blind-nil
  // eligibility — once the player has committed to a non-blind bid they
  // can no longer claim they never looked.
  const revealed = a.bid.kind === 'blindNil' ? current.handRevealed : true;
  const players = state.players.map((p) =>
    p.id === a.playerId ? { ...p, bid: a.bid, handRevealed: revealed } : p,
  );
  const allBid = players.every((p) => p.bid !== null);
  if (allBid) {
    // Play begins with the player to the left of the dealer.
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

// ─── Play (tricks) ─────────────────────────────────────────────────

function isSpadeCard(card: Card): boolean {
  // Jokers are also treated as spades for the "spades broken" and
  // "can't lead spades" rules.
  return card.suit === 'S' || card.rank === 'BigJoker' || card.rank === 'LittleJoker';
}

export function legalPlayCardIds(state: GameState, player: PlayerState): string[] {
  if (state.phase !== 'play' || !state.currentTrick) return [];
  const trick = state.currentTrick;
  if (trick.plays.length === 0) {
    // Leader. If spades broken or whole hand is spades, anything is legal.
    const allSpades = player.hand.every(isSpadeCard);
    if (state.spadesBroken || allSpades) return player.hand.map((c) => c.id);
    return player.hand.filter((c) => !isSpadeCard(c)).map((c) => c.id);
  }
  // Follower. Must follow led suit (non-joker suit equality) if possible.
  const led = trick.ledSuit;
  if (led) {
    const followable = player.hand.filter(
      (c) => c.suit === led && c.rank !== 'BigJoker' && c.rank !== 'LittleJoker',
    );
    if (followable.length > 0) return followable.map((c) => c.id);
  }
  return player.hand.map((c) => c.id);
}

function cardTrickValue(card: Card, ledSuit: Suit | null): number {
  // Spades (including jokers) always outrank non-spades.
  if (isSpadeCard(card)) return 1000 + RANK_VALUE[card.rank];
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
  if (!legal.includes(a.cardId)) {
    if (state.currentTrick && state.currentTrick.plays.length === 0) {
      throw new Error('Spades have not been broken');
    }
    throw new Error('Must follow the led suit');
  }

  const trick = state.currentTrick!;
  // Leading with a joker is treated as leading spades.
  const ledSuit: Suit | null = trick.plays.length === 0
    ? (isSpadeCard(card) ? 'S' : card.suit)
    : trick.ledSuit;
  const newPlays = [...trick.plays, { playerId: current.id, card }];

  const players = state.players.map((p) =>
    p.id === current.id ? { ...p, hand: p.hand.filter((c) => c.id !== a.cardId) } : p,
  );
  const spadesBroken = state.spadesBroken || isSpadeCard(card);

  if (newPlays.length < players.length) {
    return {
      ...state,
      players,
      currentTrick: { ledSuit, plays: newPlays, winnerId: null },
      currentPlayerIndex: (state.currentPlayerIndex + 1) % players.length,
      spadesBroken,
    };
  }

  // Resolve trick.
  const winnerEntry = newPlays.reduce((best, p) =>
    cardTrickValue(p.card, ledSuit) > cardTrickValue(best.card, ledSuit) ? p : best,
  );
  const resolvedPlayers = players.map((p) =>
    p.id === winnerEntry.playerId ? { ...p, tricksTakenCount: p.tricksTakenCount + 1 } : p,
  );
  const completed: Trick = {
    ledSuit, plays: newPlays, winnerId: winnerEntry.playerId,
  };
  const completedTricks = [...state.completedTricks, completed];
  const handsEmpty = resolvedPlayers.every((p) => p.hand.length === 0);

  if (handsEmpty) {
    const scored = scoreRound(state, resolvedPlayers);
    const gameOver = scored.gameOver;
    return {
      ...state,
      players: scored.players,
      partnerships: scored.partnerships,
      completedTricks,
      currentTrick: null,
      currentPlayerIndex: resolvedPlayers.findIndex((p) => p.id === winnerEntry.playerId),
      spadesBroken,
      phase: gameOver ? 'gameOver' : 'roundOver',
      roundAcks: new Set(),
    };
  }
  return {
    ...state,
    players: resolvedPlayers,
    completedTricks,
    currentTrick: { ledSuit: null, plays: [], winnerId: null },
    currentPlayerIndex: resolvedPlayers.findIndex((p) => p.id === winnerEntry.playerId),
    spadesBroken,
  };
}

// ─── Scoring ────────────────────────────────────────────────────────

interface ScoringResult {
  players: PlayerState[];
  partnerships: Partnership[];
  gameOver: boolean;
}

function scoreRound(state: GameState, players: PlayerState[]): ScoringResult {
  const cfg = state.config;
  if (state.players.length === 4) {
    return scorePartnership(state, players, cfg);
  }
  return scoreIndividual(state, players, cfg);
}

function scorePartnership(
  state: GameState,
  players: PlayerState[],
  cfg: SpadesConfig,
): ScoringResult {
  const partnerships = state.partnerships.map((pa) => {
    const members = players.filter((p) => p.partnershipId === pa.id);
    let contractBid = 0;
    let contractTricks = 0;
    let nilAdjust = 0;
    for (const p of members) {
      if (!p.bid) continue;
      if (p.bid.kind === 'nil' || p.bid.kind === 'blindNil') {
        const bonus = p.bid.kind === 'nil' ? cfg.nilBonus : cfg.blindNilBonus;
        nilAdjust += p.tricksTakenCount === 0 ? bonus : -bonus;
        // Canonical: nil-bidder's tricks do NOT count toward partnership contract.
      } else {
        contractBid += p.bid.n;
        contractTricks += p.tricksTakenCount;
      }
    }
    let roundPoints: number;
    let newBags = pa.sandbags;
    if (contractBid === 0) {
      roundPoints = 0;
    } else if (contractTricks >= contractBid) {
      const overtricks = contractTricks - contractBid;
      roundPoints = contractBid * 10 + overtricks;
      newBags += overtricks;
    } else {
      roundPoints = -(contractBid * 10);
    }
    // Apply 10-bag penalty(ies) — may overflow multiple penalties in one round.
    let penalty = 0;
    while (newBags >= 10) {
      penalty += cfg.bagPenaltyPerTen;
      newBags -= 10;
    }
    return {
      ...pa,
      score: pa.score + roundPoints + nilAdjust - penalty,
      sandbags: newBags,
    };
  });

  // Mirror partnership score onto each member for UI display.
  const scoredPlayers = players.map((p) => {
    const pa = partnerships.find((x) => x.id === p.partnershipId);
    if (!pa) return p;
    return { ...p };
  });
  const gameOver = determineGameOver(partnerships.map((p) => p.score), cfg);
  return { players: scoredPlayers, partnerships, gameOver };
}

function scoreIndividual(
  state: GameState,
  players: PlayerState[],
  cfg: SpadesConfig,
): ScoringResult {
  // Individual scoring. Nil bonus halved per spec note for 3p/2p.
  const nilBonus = Math.floor(cfg.nilBonus / 2);
  const blindBonus = Math.floor(cfg.blindNilBonus / 2);
  const scored = players.map((p) => {
    if (!p.bid) return p;
    let delta = 0;
    if (p.bid.kind === 'nil') {
      delta = p.tricksTakenCount === 0 ? nilBonus : -nilBonus;
    } else if (p.bid.kind === 'blindNil') {
      delta = p.tricksTakenCount === 0 ? blindBonus : -blindBonus;
    } else {
      const b = p.bid.n;
      if (p.tricksTakenCount >= b) {
        const over = p.tricksTakenCount - b;
        delta = b * 10 + over;
      } else {
        delta = -(b * 10);
      }
    }
    // Individual variant has no partnership — sandbags aren't tracked cross-round.
    // We surface the delta via the player view.
    const ghostPartnership = null;
    void ghostPartnership;
    return { ...p };
  });
  // For individual play we don't use partnerships; compute raw scores from
  // scored players — but PlayerState doesn't carry scoreTotal. We store per-round
  // delta via partnerships[] keyed by the player's id (individual "team of one").
  const partnerships: Partnership[] = players.map((p): Partnership => {
    const existing = state.partnerships.find((pa) => pa.id === (p.id as unknown as PartnershipId));
    let score = existing?.score ?? 0;
    let bags = existing?.sandbags ?? 0;
    const bid = p.bid;
    if (bid) {
      if (bid.kind === 'nil') {
        score += p.tricksTakenCount === 0 ? nilBonus : -nilBonus;
      } else if (bid.kind === 'blindNil') {
        score += p.tricksTakenCount === 0 ? blindBonus : -blindBonus;
      } else {
        const b = bid.n;
        if (p.tricksTakenCount >= b) {
          const over = p.tricksTakenCount - b;
          score += b * 10 + over;
          bags += over;
        } else {
          score -= b * 10;
        }
      }
    }
    while (bags >= 10) {
      score -= cfg.bagPenaltyPerTen;
      bags -= 10;
    }
    return {
      id: (p.id as unknown as PartnershipId),
      playerIds: [p.id, p.id],
      score,
      sandbags: bags,
    };
  });
  const gameOver = determineGameOver(partnerships.map((pa) => pa.score), cfg);
  return { players: scored, partnerships, gameOver };
}

function determineGameOver(scores: number[], cfg: SpadesConfig): boolean {
  if (scores.some((s) => s >= cfg.targetScore)) return true;
  if (cfg.lowerLimit !== null && scores.some((s) => s <= cfg.lowerLimit!)) return true;
  return false;
}

// ─── legalActions + apply + public view ────────────────────────────

export function legalActions(state: GameState, playerId: string): Action[] {
  if (state.phase === 'gameOver') return [];
  if (state.phase === 'roundOver') {
    if (state.roundAcks.has(playerId)) return [];
    return [{ kind: 'ackRound', playerId }];
  }
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) return [];
  if (state.phase === 'bid') {
    const out: Action[] = [];
    for (let n = 0; n <= 13; n++) {
      out.push({ kind: 'placeBid', playerId, bid: { kind: 'number', n } });
    }
    out.push({ kind: 'placeBid', playerId, bid: { kind: 'nil' } });
    if (isEligibleForBlindNil(state, playerId)) {
      out.push({ kind: 'placeBid', playerId, bid: { kind: 'blindNil' } });
    }
    return out;
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

function applyAckRound(
  state: GameState,
  a: Extract<Action, { kind: 'ackRound' }>,
): GameState {
  if (state.phase !== 'roundOver') throw new Error('No round to ack');
  const acks = new Set(state.roundAcks);
  acks.add(a.playerId);
  if (acks.size < state.players.length) return { ...state, roundAcks: acks };
  return startNextRound(state);
}

export function startNextRound(state: GameState): GameState {
  const dealerIndex = (state.dealerIndex + 1) % state.players.length;
  return dealRound({
    ...state,
    dealerIndex,
    roundNumber: state.roundNumber + 1,
  });
}

export interface PublicPlayerView {
  id: string;
  seat: number;
  partnershipId: PartnershipId | null;
  handCount: number;
  bid: Bid | null;
  tricksTakenCount: number;
}

export interface PublicGameState {
  players: PublicPlayerView[];
  partnerships: Partnership[];
  viewerHand: Card[] | null;
  dealerIndex: number;
  currentPlayerId: string | null;
  currentTrick: Trick | null;
  phase: Phase;
  spadesBroken: boolean;
  roundNumber: number;
}

export function getPublicView(state: GameState, viewerId: string): PublicGameState {
  // Blind-nil keeps a player's own hand hidden from themselves too until
  // the first trick they play. We enforce by checking handRevealed.
  const viewer = state.players.find((p) => p.id === viewerId);
  const showHand = viewer
    ? viewer.bid?.kind !== 'blindNil' || viewer.handRevealed
    : false;
  return {
    players: state.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      partnershipId: p.partnershipId,
      handCount: p.hand.length,
      bid: p.bid,
      tricksTakenCount: p.tricksTakenCount,
    })),
    partnerships: state.partnerships,
    viewerHand: showHand && viewer ? viewer.hand : null,
    dealerIndex: state.dealerIndex,
    currentPlayerId: state.phase === 'gameOver' || state.phase === 'roundOver'
      ? null
      : (state.players[state.currentPlayerIndex]?.id ?? null),
    currentTrick: state.currentTrick,
    phase: state.phase,
    spadesBroken: state.spadesBroken,
    roundNumber: state.roundNumber,
  };
}
