/**
 * Hearts — pure game-logic module.
 *
 * 3-7 players. Standard 52-card deck with specific cards removed for
 * non-4-player games so the deck divides evenly. Goal: avoid taking
 * hearts (1 pt each) and the Queen of Spades (13 pts). First player
 * to target score (default 100) loses; lowest wins.
 *
 * Implements full spec from ./README.md:
 *   - Card removal by player count (3p/5p/6p/7p).
 *   - Pass phase with rotating direction (left/right/across/none cycle),
 *     simultaneous hidden pass, atomic reveal.
 *   - 2♣ (or lowest club) leads first trick.
 *   - First-trick no-penalty rule.
 *   - Hearts broken tracking with "only-hearts" lead exception.
 *   - Shoot the moon (add-26 default; subtract-26 variant).
 *   - Optional J♦ -10 bonus variant with shoot adjustment.
 *   - Multi-round scoring to target.
 *
 * Public API:
 *   - newGame(playerIds, config, seed): GameState
 *   - applyAction(state, action): GameState
 *   - legalActions(state, playerId): Action[]
 *   - getPublicView(state, viewerId): PublicGameState
 *   - startNextRound(state): GameState
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

export type PassDirection = 'left' | 'right' | 'across' | 'none';

export interface PlayerState {
  id: string;
  seat: number;
  hand: Card[];
  /** Cards collected from won tricks this round (flat). */
  tricksTaken: Card[];
  scoreTotal: number;
  /** 3 cards selected for passing; null until selection is submitted. */
  pendingPass: Card[] | null;
}

export type Phase =
  | 'pass'
  | 'play'
  | 'roundOver'
  | 'gameOver';

export interface TrickPlay {
  playerId: string;
  card: Card;
}

export interface CurrentTrick {
  ledSuit: Suit | null;
  plays: TrickPlay[];
  winnerId: string | null;
}

export interface CompletedTrick {
  ledSuit: Suit;
  plays: TrickPlay[];
  winnerId: string;
}

export type Action =
  | { kind: 'selectPass'; playerId: string; cardIds: string[] }
  | { kind: 'playCard'; playerId: string; cardId: string };

export interface HeartsConfig {
  targetScore: number;
  shootMode: 'add26' | 'subtract26';
  jackOfDiamondsBonus: boolean;
  /** Starting dealer / leader index hint; the real leader is always the lowest-club holder. */
  startingDealerIndex: number;
}

export interface RoundResult {
  /** Per-player net score change this round (positive = penalties). */
  delta: Record<string, number>;
  /** True if exactly one player took all 26 points → shoot-the-moon fired. */
  shot: boolean;
  shooterId: string | null;
}

export interface GameState {
  players: PlayerState[];
  currentTrick: CurrentTrick | null;
  completedTricks: CompletedTrick[];
  currentPlayerIndex: number;
  leaderIndex: number;
  phase: Phase;
  passDirection: PassDirection;
  heartsBroken: boolean;
  isFirstTrickOfRound: boolean;
  roundNumber: number;
  turnNumber: number;
  history: Action[];
  seed: number;
  config: HeartsConfig;
  removedCards: Card[];
  roundResult: RoundResult | null;
  gameWinnerIds: string[];
}

export interface PublicPlayerState {
  id: string;
  seat: number;
  handCount: number;
  tricksTaken: Card[];
  scoreTotal: number;
  /** Shows whether this player has submitted their pass (not the cards). */
  hasPassed: boolean;
}

export interface PublicGameState {
  players: PublicPlayerState[];
  viewerHand: Card[];
  /** Viewer's own pending-pass (hidden from others). */
  viewerPendingPass: Card[] | null;
  currentTrick: CurrentTrick | null;
  completedTricks: CompletedTrick[];
  currentPlayerId: string | null;
  leaderId: string | null;
  phase: Phase;
  passDirection: PassDirection;
  heartsBroken: boolean;
  isFirstTrickOfRound: boolean;
  roundNumber: number;
  turnNumber: number;
  history: Action[];
  removedCards: Card[];
  roundResult: RoundResult | null;
  gameWinnerIds: string[];
}

// ─── Defaults ───────────────────────────────────────────────────────

export const DEFAULT_CONFIG: HeartsConfig = {
  targetScore: 100,
  shootMode: 'add26',
  jackOfDiamondsBonus: false,
  startingDealerIndex: 0,
};

// ─── Constants ──────────────────────────────────────────────────────

const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: readonly Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
];

const RANK_ORD: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

// Card removal schedule keyed by player count. Ensures the deck
// divides evenly: 3p→51, 4p→52, 5p→50, 6p→48, 7p→49.
const REMOVED_IDS_BY_COUNT: Record<number, string[]> = {
  2: [],
  3: ['2D'],
  4: [],
  5: ['2D', '2C'],
  6: ['2D', '2C', '3D', '3C'],
  7: ['2D', '2C', '2S'],
};

// ─── Deck ───────────────────────────────────────────────────────────

function buildDeck(playerCount: number): { deck: Card[]; removed: Card[] } {
  const removedIds = new Set(REMOVED_IDS_BY_COUNT[playerCount] ?? []);
  const deck: Card[] = [];
  const removed: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const id = `${rank}${suit}`;
      const card: Card = { suit, rank, id };
      if (removedIds.has(id)) removed.push(card);
      else deck.push(card);
    }
  }
  return { deck, removed };
}

/**
 * Find the seat of the player who holds the lowest club. They lead
 * the first trick. In 5p/6p (2♣ removed), the lowest club is the
 * 3♣ — or 4♣ in the 6p case.
 */
function seatWithLowestClub(players: PlayerState[]): number {
  let bestSeat = -1;
  let bestRank = Infinity;
  for (const p of players) {
    for (const c of p.hand) {
      if (c.suit !== 'C') continue;
      const ord = RANK_ORD[c.rank];
      if (ord < bestRank) {
        bestRank = ord;
        bestSeat = p.seat;
      }
    }
  }
  return bestSeat;
}

function passDirectionForRound(round: number, playerCount: number): PassDirection {
  // 3p: left/right/none cycle (3-long). 4+p: left/right/across/none (4-long).
  if (playerCount === 3) {
    const mod = (round - 1) % 3;
    if (mod === 0) return 'left';
    if (mod === 1) return 'right';
    return 'none';
  }
  const mod = (round - 1) % 4;
  if (mod === 0) return 'left';
  if (mod === 1) return 'right';
  if (mod === 2) return 'across';
  return 'none';
}

function cardPoints(card: Card, config: HeartsConfig): number {
  if (card.suit === 'H') return 1;
  if (card.suit === 'S' && card.rank === 'Q') return 13;
  if (config.jackOfDiamondsBonus && card.suit === 'D' && card.rank === 'J') return -10;
  return 0;
}

function pointsInCards(cards: Card[], config: HeartsConfig): number {
  return cards.reduce((n, c) => n + cardPoints(c, config), 0);
}

// ─── Public API ─────────────────────────────────────────────────────

export function newGame(
  playerIds: string[],
  config: HeartsConfig,
  seed: number,
): GameState {
  if (playerIds.length < 3 || playerIds.length > 7) {
    throw new Error(`Hearts supports 3–7 players, got ${playerIds.length}`);
  }
  return dealHand({
    playerIds,
    roundNumber: 1,
    seed,
    config,
    carriedScores: playerIds.map(() => 0),
    startingDealerIndex: config.startingDealerIndex % playerIds.length,
  });
}

interface DealArgs {
  playerIds: string[];
  roundNumber: number;
  seed: number;
  config: HeartsConfig;
  carriedScores: number[];
  startingDealerIndex: number;
}

function dealHand(args: DealArgs): GameState {
  const n = args.playerIds.length;
  const { deck, removed } = buildDeck(n);
  const rng = mulberry32(deriveSeed(args.seed, args.roundNumber));
  shuffleInPlace(deck, rng);

  const dealSize = Math.floor(deck.length / n);
  const players: PlayerState[] = args.playerIds.map((id, seat) => ({
    id,
    seat,
    hand: [],
    tricksTaken: [],
    scoreTotal: args.carriedScores[seat] ?? 0,
    pendingPass: null,
  }));
  for (let round = 0; round < dealSize; round++) {
    for (const p of players) {
      p.hand.push(deck.shift()!);
    }
  }
  // Any leftover card (never happens in evenly-divided variants) goes
  // to removed so totals still check out.
  for (const c of deck) removed.push(c);

  const passDir = passDirectionForRound(args.roundNumber, n);
  const phase: Phase = passDir === 'none' ? 'play' : 'pass';

  // Leader = lowest-club holder. Set only when we reach play phase; if
  // we're in pass, we re-derive after passing completes.
  const leaderIndex = phase === 'play' ? seatWithLowestClub(players) : -1;

  return {
    players,
    currentTrick: phase === 'play' ? { ledSuit: null, plays: [], winnerId: null } : null,
    completedTricks: [],
    currentPlayerIndex: leaderIndex >= 0 ? leaderIndex : 0,
    leaderIndex: leaderIndex >= 0 ? leaderIndex : 0,
    phase,
    passDirection: passDir,
    heartsBroken: false,
    isFirstTrickOfRound: true,
    roundNumber: args.roundNumber,
    turnNumber: 0,
    history: [],
    seed: args.seed,
    config: args.config,
    removedCards: removed,
    roundResult: null,
    gameWinnerIds: [],
  };
}

export function legalActions(state: GameState, playerId: string): Action[] {
  if (state.phase === 'roundOver' || state.phase === 'gameOver') return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];

  if (state.phase === 'pass') {
    if (player.pendingPass !== null) return []; // already submitted
    // Legal = any 3-subset. Enumerating all is expensive; surface the
    // hand instead and let callers construct selections.
    // Return a sentinel action with the player's cards — callers can
    // pick any 3.
    return []; // selection is caller-driven; legalActions is informational
  }

  if (state.phase !== 'play') return [];
  const current = state.players[state.currentPlayerIndex]!;
  if (playerId !== current.id) return [];

  const legal = legalPlays(
    player.hand,
    state.currentTrick,
    state.heartsBroken,
    state.isFirstTrickOfRound,
    state.leaderIndex === current.seat,
  );
  return legal.map((c) => ({ kind: 'playCard' as const, playerId, cardId: c.id }));
}

export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase === 'roundOver' || state.phase === 'gameOver') {
    throw new Error(`Cannot apply action in phase ${state.phase}`);
  }
  switch (action.kind) {
    case 'selectPass': return applySelectPass(state, action);
    case 'playCard': return applyPlayCard(state, action);
  }
}

export function getPublicView(state: GameState, viewerId: string): PublicGameState {
  const viewer = state.players.find((p) => p.id === viewerId);
  return {
    players: state.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      handCount: p.hand.length,
      tricksTaken: [...p.tricksTaken],
      scoreTotal: p.scoreTotal,
      hasPassed: p.pendingPass !== null,
    })),
    viewerHand: viewer ? [...viewer.hand] : [],
    viewerPendingPass: viewer?.pendingPass ? [...viewer.pendingPass] : null,
    currentTrick: state.currentTrick,
    completedTricks: state.completedTricks,
    currentPlayerId:
      state.phase === 'roundOver' || state.phase === 'gameOver'
        ? null
        : state.players[state.currentPlayerIndex]!.id,
    leaderId: state.leaderIndex >= 0 ? state.players[state.leaderIndex]!.id : null,
    phase: state.phase,
    passDirection: state.passDirection,
    heartsBroken: state.heartsBroken,
    isFirstTrickOfRound: state.isFirstTrickOfRound,
    roundNumber: state.roundNumber,
    turnNumber: state.turnNumber,
    history: state.history,
    removedCards: state.removedCards,
    roundResult: state.roundResult,
    gameWinnerIds: state.gameWinnerIds,
  };
}

// ─── Action handlers ────────────────────────────────────────────────

function applySelectPass(
  state: GameState,
  action: Extract<Action, { kind: 'selectPass' }>,
): GameState {
  if (state.phase !== 'pass') throw new Error('Not in pass phase');
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) throw new Error(`Unknown player ${action.playerId}`);
  if (player.pendingPass !== null) throw new Error('Already passed');
  if (action.cardIds.length !== 3) {
    throw new Error(`Pass must be exactly 3 cards (got ${action.cardIds.length})`);
  }
  const cards: Card[] = [];
  for (const id of action.cardIds) {
    const card = player.hand.find((c) => c.id === id);
    if (!card) throw new Error(`Card ${id} not in hand`);
    if (cards.some((c) => c.id === id)) throw new Error(`Duplicate card ${id}`);
    cards.push(card);
  }

  const newPlayers = state.players.map((p) =>
    p.id === player.id ? { ...p, pendingPass: cards } : p,
  );
  let next: GameState = {
    ...state,
    players: newPlayers,
    history: [...state.history, action],
  };

  // If everyone has selected, resolve the pass atomically.
  if (newPlayers.every((p) => p.pendingPass !== null)) {
    next = resolvePasses(next);
  }
  return next;
}

function resolvePasses(state: GameState): GameState {
  const n = state.players.length;
  const dir = state.passDirection;
  const offset =
    dir === 'left' ? 1 :
    dir === 'right' ? -1 :
    dir === 'across' ? Math.floor(n / 2) :
    0;
  if (offset === 0) return state; // 'none' shouldn't reach here

  // Build updated hands: remove each player's pendingPass from their
  // own hand, then add them to the recipient's hand.
  const newHands: Record<number, Card[]> = {};
  for (const p of state.players) newHands[p.seat] = [...p.hand];

  for (const p of state.players) {
    const passed = p.pendingPass!;
    const passedIds = new Set(passed.map((c) => c.id));
    newHands[p.seat] = newHands[p.seat]!.filter((c) => !passedIds.has(c.id));
  }
  for (const p of state.players) {
    const recipientSeat = ((p.seat + offset) % n + n) % n;
    newHands[recipientSeat]!.push(...p.pendingPass!);
  }

  const newPlayers = state.players.map((p) => ({
    ...p,
    hand: newHands[p.seat]!,
    pendingPass: null,
  }));
  const leaderIdx = seatWithLowestClub(newPlayers);

  return {
    ...state,
    players: newPlayers,
    phase: 'play',
    leaderIndex: leaderIdx,
    currentPlayerIndex: leaderIdx,
    currentTrick: { ledSuit: null, plays: [], winnerId: null },
  };
}

function applyPlayCard(
  state: GameState,
  action: Extract<Action, { kind: 'playCard' }>,
): GameState {
  if (state.phase !== 'play') throw new Error(`Not in play phase`);
  const current = state.players[state.currentPlayerIndex]!;
  if (current.id !== action.playerId) {
    throw new Error(`Not ${action.playerId}'s turn`);
  }
  const card = current.hand.find((c) => c.id === action.cardId);
  if (!card) throw new Error(`Card ${action.cardId} not in hand`);

  const legal = legalPlays(
    current.hand,
    state.currentTrick,
    state.heartsBroken,
    state.isFirstTrickOfRound,
    state.leaderIndex === current.seat,
  );
  if (!legal.some((c) => c.id === card.id)) {
    throw new Error(
      `Illegal play: ${card.id} (ledSuit=${state.currentTrick?.ledSuit}, heartsBroken=${state.heartsBroken}, firstTrick=${state.isFirstTrickOfRound})`,
    );
  }

  const newHand = current.hand.filter((c) => c.id !== card.id);
  const newPlayers = state.players.map((p) =>
    p.seat === current.seat ? { ...p, hand: newHand } : p,
  );

  const ledSuit =
    state.currentTrick!.plays.length === 0 ? card.suit : state.currentTrick!.ledSuit!;
  const plays: TrickPlay[] = [...state.currentTrick!.plays, { playerId: current.id, card }];
  const newTrick: CurrentTrick = { ledSuit, plays, winnerId: null };

  // Track hearts broken.
  let heartsBroken = state.heartsBroken;
  if (card.suit === 'H') heartsBroken = true;
  if (card.suit === 'S' && card.rank === 'Q') {
    // Q♠ on a non-hearts-led trick also "breaks" hearts in some
    // variants; spec says only hearts being played triggers it.
    // Keep strict: Q♠ does not break hearts.
  }

  // Trick complete?
  const n = state.players.length;
  if (plays.length >= n) {
    return completeTrick({
      ...state,
      players: newPlayers,
      currentTrick: newTrick,
      heartsBroken,
      history: [...state.history, action],
    });
  }

  const nextIdx = (current.seat + 1) % n;
  return {
    ...state,
    players: newPlayers,
    currentTrick: newTrick,
    heartsBroken,
    currentPlayerIndex: nextIdx,
    history: [...state.history, action],
    turnNumber: state.turnNumber + 1,
  };
}

// ─── Legal plays ────────────────────────────────────────────────────

/**
 * Compute legal plays for a player given current trick + game flags.
 * Exposed so bots and UI can share the same logic.
 */
export function legalPlays(
  hand: Card[],
  trick: CurrentTrick | null,
  heartsBroken: boolean,
  isFirstTrickOfRound: boolean,
  isLeader: boolean,
): Card[] {
  if (hand.length === 0) return [];

  // First trick of the round has special rules.
  if (isFirstTrickOfRound) {
    if (isLeader && (!trick || trick.plays.length === 0)) {
      // Must lead lowest club (2♣, or 3♣ if 2♣ removed).
      const clubs = hand.filter((c) => c.suit === 'C');
      if (clubs.length === 0) return [...hand]; // shouldn't happen with proper deal
      let lowest = clubs[0]!;
      for (const c of clubs) {
        if (RANK_ORD[c.rank] < RANK_ORD[lowest.rank]) lowest = c;
      }
      return [lowest];
    }
    // Non-leader on first trick:
    const led = trick!.ledSuit!;
    const followers = hand.filter((c) => c.suit === led);
    const candidates = followers.length > 0 ? followers : [...hand];
    // Can't play hearts or Q♠ unless the whole hand is penalty cards.
    const nonPenalty = candidates.filter(
      (c) => !(c.suit === 'H' || (c.suit === 'S' && c.rank === 'Q')),
    );
    if (nonPenalty.length > 0) return nonPenalty;
    return candidates; // hand is all penalty — play anything legal
  }

  // Non-first-trick.
  if (isLeader && (!trick || trick.plays.length === 0)) {
    if (heartsBroken) return [...hand];
    const nonHearts = hand.filter((c) => c.suit !== 'H');
    if (nonHearts.length > 0) return nonHearts;
    return [...hand]; // only hearts left — forced to lead hearts
  }

  const led = trick!.ledSuit!;
  const followers = hand.filter((c) => c.suit === led);
  if (followers.length > 0) return followers;
  return [...hand];
}

// ─── Trick / round completion ───────────────────────────────────────

function completeTrick(state: GameState): GameState {
  const trick = state.currentTrick!;
  // Winner: highest card of led suit.
  let bestIdx = 0;
  let bestScore = trick.plays[0]!.card.suit === trick.ledSuit!
    ? RANK_ORD[trick.plays[0]!.card.rank]
    : -1;
  for (let i = 1; i < trick.plays.length; i++) {
    const c = trick.plays[i]!.card;
    const score = c.suit === trick.ledSuit! ? RANK_ORD[c.rank] : -1;
    if (score > bestScore) {
      bestIdx = i;
      bestScore = score;
    }
  }
  const winner = trick.plays[bestIdx]!.playerId;
  const winnerSeat = state.players.find((p) => p.id === winner)!.seat;

  const newPlayers = state.players.map((p) =>
    p.seat === winnerSeat
      ? { ...p, tricksTaken: [...p.tricksTaken, ...trick.plays.map((pl) => pl.card)] }
      : p,
  );
  const completed: CompletedTrick = {
    ledSuit: trick.ledSuit!,
    plays: trick.plays,
    winnerId: winner,
  };

  // Are all tricks played?
  const handsEmpty = newPlayers.every((p) => p.hand.length === 0);
  if (handsEmpty) {
    return finishRound({
      ...state,
      players: newPlayers,
      currentTrick: null,
      completedTricks: [...state.completedTricks, completed],
      isFirstTrickOfRound: false,
    });
  }

  return {
    ...state,
    players: newPlayers,
    currentTrick: { ledSuit: null, plays: [], winnerId: null },
    completedTricks: [...state.completedTricks, completed],
    leaderIndex: winnerSeat,
    currentPlayerIndex: winnerSeat,
    isFirstTrickOfRound: false,
  };
}

function finishRound(state: GameState): GameState {
  const rawPoints: Record<string, number> = {};
  for (const p of state.players) {
    rawPoints[p.id] = pointsInCards(p.tricksTaken, state.config);
  }

  // Shoot the moon: one player has exactly 26 points' worth of hearts
  // + Q♠ (J♦ bonus is ignored for the 26-check).
  const shooter = detectShooter(state);
  const delta: Record<string, number> = { ...rawPoints };
  let shot = false;
  let shooterId: string | null = null;

  if (shooter) {
    shot = true;
    shooterId = shooter.id;
    if (state.config.shootMode === 'add26') {
      // Everyone else +26, shooter 0.
      for (const p of state.players) {
        delta[p.id] = p.id === shooter.id ? 0 : 26;
      }
    } else {
      // subtract26: shooter -26, others unchanged (their raw penalty
      // stands but shooter "benefits").
      delta[shooter.id] = -26;
      // Others keep rawPoints (which should already be 0 since shooter
      // took everything, but preserve the math).
    }
    // J♦ bonus: if the shooter took J♦, it's already in rawPoints as
    // -10. After add26, we add 26 to everyone else AND shooter still
    // has 0 (0 + -10 from the J♦? No: we explicitly set to 0). Per
    // spec §7, J♦ bonus applies normally; preserve.
    if (state.config.jackOfDiamondsBonus) {
      const jdHolder = state.players.find((p) =>
        p.tricksTaken.some((c) => c.suit === 'D' && c.rank === 'J'),
      );
      if (jdHolder && state.config.shootMode === 'add26') {
        delta[jdHolder.id] = (delta[jdHolder.id] ?? 0) - 10;
      }
    }
  }

  const newPlayers = state.players.map((p) => ({
    ...p,
    scoreTotal: p.scoreTotal + (delta[p.id] ?? 0),
  }));

  const result: RoundResult = { delta, shot, shooterId };
  const finished: GameState = {
    ...state,
    players: newPlayers,
    phase: 'roundOver',
    roundResult: result,
  };
  return checkGameEnd(finished);
}

function detectShooter(state: GameState): PlayerState | null {
  // Shooter = took all 13 hearts + Q♠ = 13 + 13 = 26 penalty points.
  // With J♦ variant: shooting is the same 26-penalty threshold; the
  // J♦ doesn't affect whether you shot.
  let shooter: PlayerState | null = null;
  let shooterHearts = 0;
  let shooterHasQueen = false;
  for (const p of state.players) {
    const hearts = p.tricksTaken.filter((c) => c.suit === 'H').length;
    const queen = p.tricksTaken.some((c) => c.suit === 'S' && c.rank === 'Q');
    if (hearts > 0 || queen) {
      if (shooter) return null; // more than one player took penalties
      shooter = p;
      shooterHearts = hearts;
      shooterHasQueen = queen;
    }
  }
  if (!shooter) return null;
  // Must have all hearts in play (13 for 4p, fewer if some removed —
  // but Hearts never removes hearts).
  const totalHearts = 13;
  if (shooterHearts !== totalHearts || !shooterHasQueen) return null;
  if (state.config.jackOfDiamondsBonus) {
    // Spec §7 J♦ variant: shooting requires the J♦ too.
    const tookJd = shooter.tricksTaken.some((c) => c.suit === 'D' && c.rank === 'J');
    if (!tookJd) return null;
  }
  return shooter;
}

function checkGameEnd(state: GameState): GameState {
  const target = state.config.targetScore;
  const anyReached = state.players.some((p) => p.scoreTotal >= target);
  if (!anyReached) return state;
  const minScore = Math.min(...state.players.map((p) => p.scoreTotal));
  const winners = state.players
    .filter((p) => p.scoreTotal === minScore)
    .map((p) => p.id);
  return { ...state, phase: 'gameOver', gameWinnerIds: winners };
}

/** Start the next round, preserving cumulative scores. */
export function startNextRound(state: GameState): GameState {
  if (state.phase !== 'roundOver') {
    throw new Error(`Cannot start next round from phase ${state.phase}`);
  }
  return dealHand({
    playerIds: state.players.map((p) => p.id),
    roundNumber: state.roundNumber + 1,
    seed: state.seed,
    config: state.config,
    carriedScores: state.players.map((p) => p.scoreTotal),
    startingDealerIndex: state.config.startingDealerIndex,
  });
}
