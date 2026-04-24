/**
 * Go Fish — pure game-logic module.
 *
 * 2–6 players. Players ask each other for ranks they already hold,
 * collect 4-of-a-kind "books," and the player with the most books
 * when the deck and all hands are exhausted wins. Deterministic via
 * seeded PRNG. Implements the full ruleset from ./README.md,
 * including:
 *   - Auto-laying books at deal time (multiple books in starting hand
 *     are laid in rank order for deterministic history).
 *   - Strict ask rules: must hold the rank, can't ask self, can't ask
 *     an empty-handed opponent, can't ask for a rank already booked.
 *   - Empty-hand auto-draw at start of turn (exactly one card; spec
 *     §7 "empty_hand_redraw: draw one for safety").
 *   - Multi-turn flow: successful ask → another turn; "lucky fish"
 *     (drew the asked rank) → another turn when configured.
 *   - Game end when all 13 books are complete.
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
  | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export interface PlayerState {
  id: string;
  hand: Card[];
  /** Ordered list of ranks the player has booked. */
  books: Rank[];
}

export type Phase = 'awaitingAsk' | 'gameOver';

export type Action =
  | { kind: 'ask'; askerId: string; targetId: string; rank: Rank }
  /**
   * `fish` and `bookLaid` and `autoDraw` are engine-produced history
   * entries — they're NOT intended to be submitted externally; they
   * surface in state.history so public observers can reconstruct
   * every pipeline step without replaying hidden state.
   */
  | { kind: 'fish'; playerId: string; drawnRank: Rank | null; matched: boolean }
  | { kind: 'bookLaid'; playerId: string; rank: Rank }
  | { kind: 'autoDraw'; playerId: string; drewCard: boolean }
  | { kind: 'turnPass'; fromId: string; toId: string };

export interface GoFishConfig {
  /** Drew the rank you asked for → another turn. Default true. */
  luckyFishExtraTurn: boolean;
  /** Reveal the lucky-fish card publicly. Default false (UI hides it). */
  mustRevealLuckyFish: boolean;
  /**
   * `auto` uses 7/7/5 by player count; a positive integer overrides
   * (clamped against available deck size).
   */
  initialHandSize: 'auto' | number;
  /** Enforce that the asker must hold the rank. Default true (standard). */
  askingRuleStrict: boolean;
  /**
   * Auto-draw rule when a player starts their turn empty-handed.
   * `one`: draw exactly one card (default — safest, matches most rules).
   * `redraw`: draw back up to `initialHandSize` if stock has enough.
   */
  emptyHandRedraw: 'one' | 'redraw';
  /** If true, break ties at game end by fewest cards acquired. Default false. */
  tieBreakByCardCount: boolean;
  /** Starting seat; defaults to 0 (deterministic). */
  startingPlayerIndex: number;
}

export interface GameState {
  players: PlayerState[];
  stock: Card[];
  currentPlayerIndex: number;
  phase: Phase;
  turnNumber: number;
  history: Action[];
  winnerIds: string[];
  seed: number;
  config: GoFishConfig;
}

export interface PublicPlayerState {
  id: string;
  handCount: number;
  books: Rank[];
}

export interface PublicGameState {
  players: PublicPlayerState[];
  viewerHand: Card[];
  stockCount: number;
  currentPlayerId: string | null;
  phase: Phase;
  turnNumber: number;
  /** Full public ask / fish history — vital for Go Fish deduction. */
  history: Action[];
  winnerIds: string[];
}

// ─── Defaults ───────────────────────────────────────────────────────

export const DEFAULT_CONFIG: GoFishConfig = {
  luckyFishExtraTurn: true,
  mustRevealLuckyFish: false,
  initialHandSize: 'auto',
  askingRuleStrict: true,
  emptyHandRedraw: 'one',
  tieBreakByCardCount: false,
  startingPlayerIndex: 0,
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

function resolveDealSize(playerCount: number, config: GoFishConfig): number {
  if (typeof config.initialHandSize === 'number') return config.initialHandSize;
  if (playerCount <= 4) return 7;
  return 5;
}

// ─── Deck ───────────────────────────────────────────────────────────

function buildDeck(): Card[] {
  const out: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) out.push({ suit: s, rank: r, id: `${r}${s}` });
  return out;
}

// ─── Public API ─────────────────────────────────────────────────────

export function newGame(
  playerIds: string[],
  config: GoFishConfig,
  seed: number,
): GameState {
  if (playerIds.length < 2 || playerIds.length > 6) {
    throw new Error(`Go Fish supports 2–6 players, got ${playerIds.length}`);
  }
  const rng = mulberry32(deriveSeed(seed, 0));
  const deck = buildDeck();
  shuffleInPlace(deck, rng);

  const dealSize = resolveDealSize(playerIds.length, config);
  if (dealSize * playerIds.length > deck.length) {
    throw new Error(
      `Cannot deal ${dealSize} per player to ${playerIds.length} players (deck has ${deck.length})`,
    );
  }

  const players: PlayerState[] = playerIds.map((id) => ({
    id,
    hand: [],
    books: [],
  }));
  for (let round = 0; round < dealSize; round++) {
    for (let p = 0; p < playerIds.length; p++) {
      players[p]!.hand.push(deck.shift()!);
    }
  }

  // Auto-lay any starting-hand books. Iterate ranks in order so the
  // history is deterministic when multiple players have books at deal
  // time.
  const history: Action[] = [];
  for (const rank of RANKS) {
    for (const p of players) {
      const count = p.hand.filter((c) => c.rank === rank).length;
      if (count === 4) {
        p.hand = p.hand.filter((c) => c.rank !== rank);
        p.books = [...p.books, rank];
        history.push({ kind: 'bookLaid', playerId: p.id, rank });
      }
    }
  }

  const startIdx = Math.max(0, Math.min(config.startingPlayerIndex, playerIds.length - 1));
  return {
    players,
    stock: deck,
    currentPlayerIndex: startIdx,
    phase: totalBooks(players) >= 13 ? 'gameOver' : 'awaitingAsk',
    turnNumber: 1,
    history,
    winnerIds: totalBooks(players) >= 13 ? computeWinners(players, config) : [],
    seed,
    config,
  };
}

export function legalActions(state: GameState, playerId: string): Action[] {
  if (state.phase === 'gameOver') return [];
  const current = state.players[state.currentPlayerIndex]!;
  if (playerId !== current.id) return [];

  // If asker has no cards, they auto-draw (not an askable action);
  // no manual actions are legal.
  if (current.hand.length === 0) return [];

  const out: Action[] = [];
  // Ranks the asker holds (can legally ask for).
  const heldRanks = new Set<Rank>();
  for (const c of current.hand) heldRanks.add(c.rank);

  for (const target of state.players) {
    if (target.id === current.id) continue;
    if (target.hand.length === 0) continue;
    for (const rank of heldRanks) {
      out.push({ kind: 'ask', askerId: current.id, targetId: target.id, rank });
    }
  }
  return out;
}

export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase === 'gameOver') {
    throw new Error('Cannot apply actions in gameOver phase');
  }
  if (action.kind !== 'ask') {
    throw new Error(`Only 'ask' actions are submitted externally (got ${action.kind})`);
  }
  return applyAsk(state, action);
}

export function getPublicView(state: GameState, viewerId: string): PublicGameState {
  const viewer = state.players.find((p) => p.id === viewerId);
  return {
    players: state.players.map((p) => ({
      id: p.id,
      handCount: p.hand.length,
      books: [...p.books],
    })),
    viewerHand: viewer ? [...viewer.hand] : [],
    stockCount: state.stock.length,
    currentPlayerId:
      state.phase === 'gameOver' ? null : state.players[state.currentPlayerIndex]!.id,
    phase: state.phase,
    turnNumber: state.turnNumber,
    history: [...state.history],
    winnerIds: [...state.winnerIds],
  };
}

// ─── Action handler ─────────────────────────────────────────────────

function applyAsk(
  state: GameState,
  action: Extract<Action, { kind: 'ask' }>,
): GameState {
  let working = state;

  // ── Start-of-turn auto-draw for empty-handed asker ────────────────
  // (§6: asker's hand empty → draw one card, turn ends.)
  // This is handled lazily: if the current player is empty-handed
  // we need to auto-draw BEFORE they submit an action. Tests exercise
  // the engine's `advance` path below. Here in `applyAsk`, an
  // empty-handed current player is rejected via legalActions first.
  const current = working.players[working.currentPlayerIndex]!;
  if (action.askerId !== current.id) {
    throw new Error(`Not ${action.askerId}'s turn (${current.id} is current)`);
  }
  if (current.hand.length === 0) {
    throw new Error(`${current.id} has an empty hand — must auto-draw first`);
  }
  if (action.targetId === action.askerId) {
    throw new Error('Cannot ask yourself');
  }
  const target = working.players.find((p) => p.id === action.targetId);
  if (!target) throw new Error(`Target ${action.targetId} not found`);
  if (target.hand.length === 0) {
    throw new Error(`Cannot ask ${target.id}: empty hand`);
  }
  if (working.config.askingRuleStrict) {
    const has = current.hand.some((c) => c.rank === action.rank);
    if (!has) throw new Error(`Cannot ask for ${action.rank}: not in your hand`);
  }

  // Log the ask.
  working = {
    ...working,
    history: [...working.history, action],
    turnNumber: working.turnNumber + 1,
  };

  // ── Resolve the ask ───────────────────────────────────────────────
  const matchedCards = target.hand.filter((c) => c.rank === action.rank);
  if (matchedCards.length > 0) {
    // Transfer all matched cards to the asker.
    const newTargetHand = target.hand.filter((c) => c.rank !== action.rank);
    const newAskerHand = [...current.hand, ...matchedCards];
    working = {
      ...working,
      players: working.players.map((p) => {
        if (p.id === current.id) return { ...p, hand: newAskerHand };
        if (p.id === target.id) return { ...p, hand: newTargetHand };
        return p;
      }),
    };
    working = maybeBook(working, current.id);
    return autoAdvance(working, /* keepTurn */ true);
  }

  // ── Go Fish: draw one from stock ──────────────────────────────────
  if (working.stock.length === 0) {
    // No draw possible; turn passes.
    working = {
      ...working,
      history: [
        ...working.history,
        { kind: 'fish', playerId: current.id, drawnRank: null, matched: false },
      ],
    };
    return autoAdvance(working, /* keepTurn */ false);
  }

  const [drawn, ...rest] = working.stock;
  const drewCard = drawn!;
  const newAskerHand = [...current.hand, drewCard];
  const matched = drewCard.rank === action.rank;

  working = {
    ...working,
    stock: rest,
    players: working.players.map((p) =>
      p.id === current.id ? { ...p, hand: newAskerHand } : p,
    ),
    history: [
      ...working.history,
      { kind: 'fish', playerId: current.id, drawnRank: drewCard.rank, matched },
    ],
  };
  working = maybeBook(working, current.id);

  const keepTurn = matched && working.config.luckyFishExtraTurn;
  return autoAdvance(working, keepTurn);
}

/**
 * Lay any books in the named player's hand. Adds book entries to
 * history in rank order so replays are stable when multiple books
 * complete simultaneously.
 */
function maybeBook(state: GameState, playerId: string): GameState {
  const p = state.players.find((pp) => pp.id === playerId)!;
  const counts = new Map<Rank, number>();
  for (const c of p.hand) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);

  const newBooks: Rank[] = [];
  for (const rank of RANKS) {
    if (counts.get(rank) === 4) newBooks.push(rank);
  }
  if (newBooks.length === 0) return state;

  const newHand = p.hand.filter((c) => !newBooks.includes(c.rank));
  const newHistoryEntries: Action[] = newBooks.map((rank) => ({
    kind: 'bookLaid' as const,
    playerId,
    rank,
  }));
  return {
    ...state,
    players: state.players.map((pp) =>
      pp.id === playerId ? { ...pp, hand: newHand, books: [...pp.books, ...newBooks] } : pp,
    ),
    history: [...state.history, ...newHistoryEntries],
  };
}

/**
 * Advance the turn after an ask / fish resolves. Handles:
 *   - Checking game over (all 13 books).
 *   - Passing to the next player (if keepTurn=false).
 *   - Repeatedly auto-drawing if the next player is empty-handed.
 */
function autoAdvance(state: GameState, keepTurn: boolean): GameState {
  let s = state;

  // Game over?
  if (totalBooks(s.players) >= 13) {
    return {
      ...s,
      phase: 'gameOver',
      winnerIds: computeWinners(s.players, s.config),
    };
  }

  // Stuck-state check: if stock is empty and no opponent pair shares
  // any rank, nobody can ever succeed at an ask. End the game — this
  // matches real tabletop Go Fish where players call it a draw after
  // a few no-match rounds.
  if (isStuck(s)) {
    return {
      ...s,
      phase: 'gameOver',
      winnerIds: computeWinners(s.players, s.config),
    };
  }

  if (!keepTurn) {
    const fromId = s.players[s.currentPlayerIndex]!.id;
    const nextIdx = (s.currentPlayerIndex + 1) % s.players.length;
    const toId = s.players[nextIdx]!.id;
    s = {
      ...s,
      currentPlayerIndex: nextIdx,
      history: [...s.history, { kind: 'turnPass', fromId, toId }],
    };
  }

  // Roll forward through any empty-handed players. Safety cap to
  // prevent pathological loops.
  for (let safety = 0; safety < 30; safety++) {
    const current = s.players[s.currentPlayerIndex]!;
    if (current.hand.length > 0) break;

    if (s.stock.length === 0) {
      // This player is done for the rest of the game. Move on.
      const fromId = current.id;
      const nextIdx = (s.currentPlayerIndex + 1) % s.players.length;
      const toId = s.players[nextIdx]!.id;
      // If EVERY player is empty and stock is empty, game is effectively
      // over even though books may still be < 13 (shouldn't happen with
      // 52-card deck). Detect and exit.
      const allDone = s.players.every(
        (p) => p.hand.length === 0 && p.id !== current.id,
      );
      if (allDone) {
        return {
          ...s,
          phase: 'gameOver',
          winnerIds: computeWinners(s.players, s.config),
        };
      }
      s = {
        ...s,
        currentPlayerIndex: nextIdx,
        history: [...s.history, { kind: 'turnPass', fromId, toId }],
      };
      continue;
    }

    // Auto-draw per config.
    const toDraw =
      s.config.emptyHandRedraw === 'redraw'
        ? Math.min(
            s.stock.length,
            resolveDealSize(s.players.length, s.config),
          )
        : 1;
    const drawn = s.stock.slice(0, toDraw);
    s = {
      ...s,
      stock: s.stock.slice(toDraw),
      players: s.players.map((p) =>
        p.id === current.id ? { ...p, hand: [...p.hand, ...drawn] } : p,
      ),
      history: [
        ...s.history,
        { kind: 'autoDraw', playerId: current.id, drewCard: drawn.length > 0 },
      ],
    };
    s = maybeBook(s, current.id);
    // Spec §4 step 1: empty-handed auto-draw ends the turn.
    const fromId = current.id;
    const nextIdx = (s.currentPlayerIndex + 1) % s.players.length;
    const toId = s.players[nextIdx]!.id;
    s = {
      ...s,
      currentPlayerIndex: nextIdx,
      history: [...s.history, { kind: 'turnPass', fromId, toId }],
    };
    // After the auto-draw + turn pass, re-check game-over and loop.
    if (totalBooks(s.players) >= 13) {
      return {
        ...s,
        phase: 'gameOver',
        winnerIds: computeWinners(s.players, s.config),
      };
    }
  }
  return s;
}

function totalBooks(players: PlayerState[]): number {
  return players.reduce((n, p) => n + p.books.length, 0);
}

/**
 * Returns true when the stock is empty and no pair of players shares
 * any rank — the game is provably stuck because nobody can ever
 * satisfy an ask.
 */
function isStuck(state: GameState): boolean {
  if (state.stock.length > 0) return false;
  for (const a of state.players) {
    if (a.hand.length === 0) continue;
    const aRanks = new Set<Rank>();
    for (const c of a.hand) aRanks.add(c.rank);
    for (const b of state.players) {
      if (b.id === a.id) continue;
      if (b.hand.length === 0) continue;
      for (const c of b.hand) {
        if (aRanks.has(c.rank)) return false;
      }
    }
  }
  return true;
}

function computeWinners(players: PlayerState[], config: GoFishConfig): string[] {
  if (players.length === 0) return [];
  const maxBooks = Math.max(...players.map((p) => p.books.length));
  let tied = players.filter((p) => p.books.length === maxBooks);
  if (config.tieBreakByCardCount && tied.length > 1) {
    // Fewest cards held wins (proxy for "efficiency"). If still tied,
    // all tied players win.
    const minHand = Math.min(...tied.map((p) => p.hand.length));
    tied = tied.filter((p) => p.hand.length === minHand);
  }
  return tied.map((p) => p.id);
}
