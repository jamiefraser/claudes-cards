/**
 * War — pure game-logic module.
 *
 * No I/O, no platform types. Every function is pure: applyAction /
 * step / playToCompletion all take a state and return a new state
 * without mutating the input. Determinism comes from the seeded PRNG
 * (mulberry32) — the same seed + config produce the same full game.
 *
 * Spec: see ./README.md. Key rules enforced here:
 *   - Standard 52-card deck, no jokers. Ace always high.
 *   - 2p (26 each), 3p (17 each with 2♠ removed), 4p (13 each).
 *   - Battle: each active player reveals top of stock. Unique highest
 *     rank wins everything on the table. Tie for highest triggers a
 *     war among the tying players only.
 *   - War round: every warring player commits 3 face-down spoils + 1
 *     face-up comparison card. Insufficient-card rule: a player with
 *     < 4 cards commits all they have and their LAST card is the
 *     face-up. 0 cards → immediate elimination and forfeit any table
 *     cards from this battle.
 *   - Stock empty at turn start (or mid-war) → reshuffle winnings
 *     into stock using the configured `reshuffleMethod`. Both empty →
 *     elimination.
 *   - Card-add order to winnings: winner's own card first, then
 *     opponents' cards in seat order starting clockwise from the
 *     winner. Spoils are ordered by table-entry insertion order
 *     (seat-order reveals followed by war-round commits).
 *   - Infinite-game safeguard: if turnNumber >= maxTurns (default
 *     10000), declare the player with the most total cards the
 *     winner; on tie, declare a draw (winnerId=null, phase=gameOver).
 */

// ─── PRNG ────────────────────────────────────────────────────────────
// mulberry32 — tiny, fast, well-known deterministic 32-bit PRNG.
// We keep the state inside a closure captured by the returned function;
// callers wrap it in a helper that returns a fresh PRNG for each action
// that needs randomness. Core state never carries a live PRNG — only
// the numeric `seed` — so GameState remains trivially serialisable.
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

// Derives a sub-seed for a downstream PRNG call. Combining the game
// seed with the turn number + a tag guarantees that shuffles done
// later in the game (reshuffling a player's winnings) don't collide
// with the deal-time shuffle even though they share the same seed.
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
/** Stable numeric rank (2..14). Ace is always 14 (high). */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
  /** Stable per-game id, e.g. "14S" (Ace of spades). */
  id: string;
}

export interface PlayerState {
  id: string;
  /** Draw from index 0. */
  stock: Card[];
  /** Append to end; reshuffled into stock when stock empties. */
  winnings: Card[];
  eliminated: boolean;
}

export type Phase = 'awaitingBattle' | 'resolvingWar' | 'gameOver';

export interface TableEntry {
  playerId: string;
  card: Card;
  /** Face-down war spoils are true; revealed comparison cards are false. */
  faceDown: boolean;
}

export interface WarConfig {
  /** 2, 3, or 4. */
  playerCount: 2 | 3 | 4;
  /** Default 10000. Safeguard against pathological loops. */
  maxTurns: number;
  /** "shuffle" (default, prevents cycles) or "preserveOrder". */
  reshuffleMethod: 'shuffle' | 'preserveOrder';
  /** Optional seat-ordered player ids. Defaults to p0..pN-1. */
  playerIds?: string[];
}

export interface GameState {
  players: PlayerState[];
  turnNumber: number;
  phase: Phase;
  table: { entries: TableEntry[] };
  /** 0 = no war in progress; increments per war round. */
  warDepth: number;
  /** Player ids still tying in the current war (empty when no war). */
  warParticipants: string[];
  /** Set when phase === 'gameOver'. null on a max-turns draw. */
  winnerId: string | null;
  seed: number;
  config: WarConfig;
  /**
   * For 3-player games, the single card removed before shuffling so
   * 51 divides evenly among 3. Null for 2p / 4p. Documented: 2♠.
   */
  removedCard: Card | null;
  /**
   * True when the last step hit maxTurns and resolved by card count.
   * Distinguishes "real ending" from "forced ending" in tests.
   */
  forcedByMaxTurns: boolean;
}

export interface PublicGameState {
  /** Per-player card counts only. Card identities are hidden. */
  players: Array<{
    id: string;
    stockCount: number;
    winningsCount: number;
    eliminated: boolean;
  }>;
  turnNumber: number;
  phase: Phase;
  /**
   * Table entries — face-up cards show their identity; face-down
   * cards show only a placeholder (null card, faceDown=true).
   */
  table: Array<{
    playerId: string;
    card: Card | null;
    faceDown: boolean;
  }>;
  warDepth: number;
  warParticipants: string[];
  winnerId: string | null;
  removedCard: Card | null;
}

// ─── Deck ───────────────────────────────────────────────────────────

const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, id: `${rank}${suit}` });
    }
  }
  return deck;
}

// ─── Public API ─────────────────────────────────────────────────────

export function newGame(config: WarConfig, seed: number): GameState {
  const playerCount = config.playerCount;
  if (playerCount !== 2 && playerCount !== 3 && playerCount !== 4) {
    throw new Error(`War supports 2–4 players, got ${playerCount}`);
  }

  const ids = config.playerIds ?? Array.from({ length: playerCount }, (_, i) => `p${i}`);
  if (ids.length !== playerCount) {
    throw new Error(`playerIds length ${ids.length} !== playerCount ${playerCount}`);
  }

  let deck = buildDeck();
  let removedCard: Card | null = null;
  if (playerCount === 3) {
    // Remove 2♠ so 51 cards divide evenly. The spec permits "typically a 2";
    // we pick 2♠ deterministically so it's consistent across seeds and
    // documented in README.
    const idx = deck.findIndex((c) => c.rank === 2 && c.suit === 'S');
    if (idx < 0) throw new Error('2♠ not found — deck corruption');
    removedCard = deck[idx]!;
    deck = [...deck.slice(0, idx), ...deck.slice(idx + 1)];
  }

  const rng = mulberry32(deriveSeed(seed, 0));
  shuffleInPlace(deck, rng);

  const players: PlayerState[] = ids.map((id) => ({
    id,
    stock: [],
    winnings: [],
    eliminated: false,
  }));
  // Round-robin deal, index 0 gets the first card.
  for (let i = 0; i < deck.length; i++) {
    players[i % playerCount]!.stock.push(deck[i]!);
  }

  return {
    players,
    turnNumber: 0,
    phase: 'awaitingBattle',
    table: { entries: [] },
    warDepth: 0,
    warParticipants: [],
    winnerId: null,
    seed,
    config,
    removedCard,
    forcedByMaxTurns: false,
  };
}

/**
 * Advance the game by one battle (awaitingBattle → awaitingBattle|resolvingWar|gameOver)
 * or one war round (resolvingWar → awaitingBattle|resolvingWar|gameOver).
 */
export function step(state: GameState): GameState {
  if (state.phase === 'gameOver') return state;

  // Turn-count safeguard. Checked at the top of every step so an ongoing
  // war can't blow past the cap.
  if (state.turnNumber >= state.config.maxTurns) {
    return declareByCardCount(state, /* forced */ true);
  }

  if (state.phase === 'awaitingBattle') return resolveBattle(state);
  return resolveWarRound(state);
}

export function playToCompletion(state: GameState): GameState {
  let s = state;
  while (s.phase !== 'gameOver') s = step(s);
  return s;
}

export function getPublicView(state: GameState, _viewerId: string): PublicGameState {
  return {
    players: state.players.map((p) => ({
      id: p.id,
      stockCount: p.stock.length,
      winningsCount: p.winnings.length,
      eliminated: p.eliminated,
    })),
    turnNumber: state.turnNumber,
    phase: state.phase,
    table: state.table.entries.map((e) => ({
      playerId: e.playerId,
      card: e.faceDown ? null : e.card,
      faceDown: e.faceDown,
    })),
    warDepth: state.warDepth,
    warParticipants: [...state.warParticipants],
    winnerId: state.winnerId,
    removedCard: state.removedCard,
  };
}

// ─── Resolution helpers ─────────────────────────────────────────────

function activePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => !p.eliminated);
}

/**
 * Ensure `player.stock` has at least one card by reshuffling winnings.
 * Returns a fresh PlayerState (possibly marked eliminated) and a flag
 * saying whether any reshuffle happened — the caller uses that flag
 * only to derive a sub-seed, not to branch behaviour.
 */
function refillStockIfNeeded(
  player: PlayerState,
  state: GameState,
  tagBase: number,
): PlayerState {
  if (player.stock.length > 0) return player;
  if (player.winnings.length === 0) {
    return { ...player, eliminated: true };
  }
  if (state.config.reshuffleMethod === 'preserveOrder') {
    return { ...player, stock: [...player.winnings], winnings: [] };
  }
  const rng = mulberry32(
    deriveSeed(state.seed, tagBase, state.turnNumber, state.warDepth, hashId(player.id)),
  );
  const shuffled = [...player.winnings];
  shuffleInPlace(shuffled, rng);
  return { ...player, stock: shuffled, winnings: [] };
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Resolve one battle from the `awaitingBattle` phase.
 *   1. Ensure every active player has a stock card (reshuffle/eliminate).
 *   2. Reveal top of stock for every active player, in seat order.
 *   3. If fewer than 2 active players remain → gameOver.
 *   4. Find the unique-highest rank. Unique → award all table cards.
 *      Tie → transition to resolvingWar with warParticipants = tied ids.
 */
function resolveBattle(state: GameState): GameState {
  // Step 1 — refill stocks.
  let players = state.players.map((p, i) =>
    p.eliminated ? p : refillStockIfNeeded(p, state, 1 + i),
  );

  // Step 2 — early exit if only one (or zero) active players remain.
  const active = players.filter((p) => !p.eliminated);
  if (active.length <= 1) {
    return finalize({ ...state, players }, active[0]?.id ?? null);
  }

  // Step 3 — reveal tops, in seat order, as face-up table entries.
  const entries: TableEntry[] = [];
  players = players.map((p) => {
    if (p.eliminated || p.stock.length === 0) return p;
    const [top, ...rest] = p.stock;
    entries.push({ playerId: p.id, card: top!, faceDown: false });
    return { ...p, stock: rest };
  });

  // Step 4 — compare.
  const topRank = Math.max(...entries.map((e) => e.card.rank));
  const topPlayers = entries.filter((e) => e.card.rank === topRank).map((e) => e.playerId);

  const next: GameState = {
    ...state,
    players,
    table: { entries: [...state.table.entries, ...entries] },
    turnNumber: state.turnNumber + 1,
  };

  if (topPlayers.length === 1) {
    return awardTable(next, topPlayers[0]!);
  }
  // Tie — enter war.
  return {
    ...next,
    phase: 'resolvingWar',
    warDepth: 1,
    warParticipants: topPlayers,
  };
}

/**
 * Resolve one war round from the `resolvingWar` phase.
 *   1. Each war participant commits up to 3 face-down spoils + 1
 *      face-up comparison card from their stock (reshuffling winnings
 *      if needed). Insufficient-card handling — last card is face-up,
 *      rest are spoils; zero cards = eliminate + forfeit.
 *   2. Compare the new face-up cards among still-participating
 *      players. Unique → award the whole table. Tie → next war round
 *      with the new tying participants.
 */
function resolveWarRound(state: GameState): GameState {
  let players = state.players;
  const newEntries: TableEntry[] = [];
  const stillParticipating: string[] = [];

  for (const pid of state.warParticipants) {
    const idx = players.findIndex((p) => p.id === pid);
    if (idx < 0) continue;
    let player = players[idx]!;

    // Refill if stock empty, possibly eliminating.
    if (player.stock.length === 0) {
      player = refillStockIfNeeded(player, state, 100);
    }

    if (player.eliminated || (player.stock.length === 0 && player.winnings.length === 0)) {
      // 0 cards at war time → eliminate + forfeit any table cards
      // they placed earlier in this battle (§5 "zero cards" rule).
      player = { ...player, eliminated: true };
      players = players.map((p, i) => (i === idx ? player : p));
      continue;
    }

    // Commit up to 4 cards: 3 face-down spoils + 1 face-up comparison.
    const total = player.stock.length + player.winnings.length;
    const commitCount = Math.min(4, total);

    const taken: Card[] = [];
    let working = player;
    for (let i = 0; i < commitCount; i++) {
      if (working.stock.length === 0) {
        working = refillStockIfNeeded(working, state, 200 + i);
        if (working.eliminated || working.stock.length === 0) break;
      }
      const [top, ...rest] = working.stock;
      taken.push(top!);
      working = { ...working, stock: rest };
    }
    player = working;

    // Last taken card is the face-up comparison. All earlier cards
    // are face-down spoils. If the player had fewer than 4 cards,
    // `taken.length` is less than 4 and the last one is still face-up.
    taken.forEach((card, i) => {
      const faceDown = i < taken.length - 1;
      newEntries.push({ playerId: pid, card, faceDown });
    });
    if (taken.length > 0) {
      stillParticipating.push(pid);
    } else {
      // Committed 0 cards (e.g. eliminated mid-commit) — drop silently.
      player = { ...player, eliminated: true };
    }
    players = players.map((p, i) => (i === idx ? player : p));
  }

  const next: GameState = {
    ...state,
    players,
    table: { entries: [...state.table.entries, ...newEntries] },
    warDepth: state.warDepth + 1,
    turnNumber: state.turnNumber + 1,
  };

  // Compare face-up cards from players still in the war.
  const faceUpsThisRound = newEntries.filter((e) => !e.faceDown && stillParticipating.includes(e.playerId));
  if (faceUpsThisRound.length === 0) {
    // Everyone ran out of cards in this war. Award the whole table to
    // any remaining active player with the most cards — this is an
    // extreme edge (all warring players eliminated simultaneously);
    // fall back to declaring by card count.
    return declareByCardCount(next, /* forced */ false);
  }
  if (faceUpsThisRound.length === 1) {
    return awardTable(next, faceUpsThisRound[0]!.playerId);
  }
  const topRank = Math.max(...faceUpsThisRound.map((e) => e.card.rank));
  const newTop = faceUpsThisRound.filter((e) => e.card.rank === topRank).map((e) => e.playerId);
  if (newTop.length === 1) {
    return awardTable(next, newTop[0]!);
  }
  // Tie persists — next war round among the still-tying players.
  return {
    ...next,
    phase: 'resolvingWar',
    warParticipants: newTop,
  };
}

/**
 * Award every card currently on the table to `winnerId`. Cards are
 * appended to the winner's `winnings` pile in a fixed, documented
 * order: winner's own cards first (in insertion order), then each
 * other seat's cards in clockwise seat order starting from the seat
 * immediately after the winner. Same ordering rule inside each seat
 * — insertion order — so a seat's face-up card precedes its spoils
 * committed in the same round.
 */
function awardTable(state: GameState, winnerId: string): GameState {
  const seatOrder = state.players.map((p) => p.id);
  const winnerSeat = seatOrder.indexOf(winnerId);
  const pickupOrder: string[] = [];
  for (let i = 0; i < seatOrder.length; i++) {
    pickupOrder.push(seatOrder[(winnerSeat + i) % seatOrder.length]!);
  }

  const bySeat: Record<string, Card[]> = {};
  for (const pid of seatOrder) bySeat[pid] = [];
  for (const e of state.table.entries) {
    bySeat[e.playerId]!.push(e.card);
  }

  const spoils: Card[] = [];
  for (const pid of pickupOrder) {
    for (const c of bySeat[pid]!) spoils.push(c);
  }

  const players = state.players.map((p) => {
    if (p.id !== winnerId) return p;
    return { ...p, winnings: [...p.winnings, ...spoils] };
  });

  const next: GameState = {
    ...state,
    players,
    table: { entries: [] },
    phase: 'awaitingBattle',
    warDepth: 0,
    warParticipants: [],
  };

  // End-of-game check: only one active player with cards left.
  const stillIn = next.players.filter(
    (p) => !p.eliminated && (p.stock.length > 0 || p.winnings.length > 0),
  );
  if (stillIn.length <= 1) {
    return finalize(next, stillIn[0]?.id ?? null);
  }
  return next;
}

function finalize(state: GameState, winnerId: string | null): GameState {
  // Any players without cards are eliminated.
  const players = state.players.map((p) => {
    if (p.eliminated) return p;
    const hasCards = p.stock.length > 0 || p.winnings.length > 0;
    return hasCards ? p : { ...p, eliminated: true };
  });
  return {
    ...state,
    players,
    phase: 'gameOver',
    winnerId,
  };
}

function declareByCardCount(state: GameState, forced: boolean): GameState {
  const counts = state.players.map((p) => ({
    id: p.id,
    total: p.stock.length + p.winnings.length,
  }));
  const maxTotal = Math.max(...counts.map((c) => c.total));
  const top = counts.filter((c) => c.total === maxTotal).map((c) => c.id);
  const winnerId = top.length === 1 ? top[0]! : null;
  return { ...finalize(state, winnerId), forcedByMaxTurns: forced };
}
