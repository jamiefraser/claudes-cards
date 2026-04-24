/**
 * Spit (a.k.a. Speed) — pure game-logic module.
 *
 * Strictly 2 players. Each player owns a 1-2-3-4-5 pyramid of columns
 * (15 cards, top-of-each face-up) plus an 11-card face-down spit pile.
 * Two central "spit piles" sit between them. Both players simultaneously
 * race to play stockpile tops onto either centre whose top rank is
 * adjacent (±1, with A↔K wrap when configured). When both are stuck,
 * either player triggers a "spit" to flip a new centre card from each
 * spit pile. A round ends when a player empties their pyramid and slaps
 * a centre — the slapped pile becomes theirs, the other goes to the
 * opponent, and a new round is dealt from the updated per-player decks.
 *
 * Despite being nominally real-time, the engine is deterministic: every
 * action is atomic and resolved strictly in receipt order. Callers
 * supply timestamps in `applyAction(state, action, timestamp)`; the
 * engine records accepted + rejected actions in `actionLog` for replay.
 *
 * Public API:
 *   - newGame(playerIds, config, seed): GameState
 *   - start(state): GameState
 *   - applyAction(state, action, timestamp): GameState
 *   - legalPlays(state, playerId): Action[]
 *   - isStuck(state, playerId): boolean
 *   - isBothStuck(state): boolean
 *   - getPublicView(state, viewerId): PublicGameState
 *   - replay(config, seed, actionLog): GameState
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
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7'
  | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

const RANK_ORDER: Rank[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
];
const RANK_INDEX: Record<Rank, number> = RANK_ORDER.reduce(
  (acc, r, i) => { acc[r] = i; return acc; },
  {} as Record<Rank, number>,
);

export type CenterIndex = 0 | 1;
export type ColumnIndex = 0 | 1 | 2 | 3 | 4;

export interface PlayerState {
  id: string;
  /** Exactly 5 stock columns. Top = last element. Face-up. */
  columns: Card[][];
  /** Face-down pile. Flipped on Spit! signal. Draw from end. */
  spitPile: Card[];
  outOfMatch: boolean;
}

export type Phase = 'setup' | 'playing' | 'roundOver' | 'matchOver';

export type Action =
  | { kind: 'start' }
  | { kind: 'play'; playerId: string; columnIndex: ColumnIndex; centerIndex: CenterIndex }
  | { kind: 'spit'; playerId: string }
  | { kind: 'slap'; playerId: string; centerIndex: CenterIndex };

export interface LogEntry {
  action: Action;
  timestamp: number;
  resolution: 'accepted' | 'rejected';
  reason?: string;
}

export interface SpitConfig {
  /** A↔K wrap for ±1 adjacency. Default true. */
  wrapRanks: boolean;
  /** Play to match end vs single round. Default true (match). */
  playToMatchEnd: boolean;
  /**
   * In a double-empty stalemate (both stuck, both spit piles empty),
   * the player with fewer stockpile cards wins the round automatically.
   * Default true per canonical rules.
   */
  stalemateShortestWins: boolean;
}

export const DEFAULT_CONFIG: SpitConfig = {
  wrapRanks: true,
  playToMatchEnd: true,
  stalemateShortestWins: true,
};

export interface GameState {
  players: [PlayerState, PlayerState];
  /** Two centre piles between players; top = last element. */
  centerPiles: [Card[], Card[]];
  phase: Phase;
  /** Set true when both players are stuck AND at least one spit pile has
   *  a card, signalling that either player may call `spit`. */
  spitAvailable: boolean;
  roundNumber: number;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
  seed: number;
  config: SpitConfig;
  actionLog: LogEntry[];
}

// ─── Deck + deal ────────────────────────────────────────────────────

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

function buildFullDeck(seed: number): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANK_ORDER) {
      cards.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  const rng = mulberry32(deriveSeed(seed, 0x5917));
  shuffleInPlace(cards, rng);
  return cards;
}

/** Build a player's layout from their 26-card deck. First 15 go into
 *  the pyramid (1 + 2 + 3 + 4 + 5), last 11 into the spit pile. For
 *  decks < 15 cards (loser with a thin reserve in later rounds) the
 *  layout is as deep as possible, left to right. */
export function buildLayout(deck: Card[]): {
  columns: Card[][];
  spitPile: Card[];
} {
  const columns: Card[][] = [[], [], [], [], []];
  const remaining = [...deck];
  for (let col = 0; col < 5; col++) {
    const size = col + 1;
    if (remaining.length < size) {
      // Partial layout — drop this column (and all subsequent).
      break;
    }
    columns[col] = remaining.splice(0, size);
  }
  return { columns, spitPile: remaining };
}

// ─── Setup ──────────────────────────────────────────────────────────

export function newGame(
  playerIds: string[],
  config: Partial<SpitConfig> = {},
  seed = 1,
): GameState {
  if (playerIds.length !== 2) {
    throw new Error('Spit requires exactly 2 players');
  }
  const cfg: SpitConfig = { ...DEFAULT_CONFIG, ...config };

  const deck = buildFullDeck(seed);
  const half1 = deck.slice(0, 26);
  const half2 = deck.slice(26, 52);
  const l1 = buildLayout(half1);
  const l2 = buildLayout(half2);

  const players: [PlayerState, PlayerState] = [
    { id: playerIds[0]!, columns: l1.columns, spitPile: l1.spitPile, outOfMatch: false },
    { id: playerIds[1]!, columns: l2.columns, spitPile: l2.spitPile, outOfMatch: false },
  ];

  return {
    players,
    centerPiles: [[], []],
    phase: 'setup',
    spitAvailable: false,
    roundNumber: 1,
    roundWinnerId: null,
    matchWinnerId: null,
    seed,
    config: cfg,
    actionLog: [],
  };
}

/** Flip both players' top spit-pile cards into the centres, starting play. */
export function start(state: GameState): GameState {
  if (state.phase !== 'setup') throw new Error('Can only start from setup phase');
  const [p1, p2] = state.players;
  // Each player contributes one card. If a player's spit pile is empty
  // (edge case only possible in tests or partial decks), their centre
  // stays empty until someone plays onto it.
  const newP1 = spitFlip(p1);
  const newP2 = spitFlip(p2);
  const center0 = newP1.flipped ? [newP1.flipped] : [];
  const center1 = newP2.flipped ? [newP2.flipped] : [];
  const next: GameState = {
    ...state,
    players: [newP1.player, newP2.player],
    centerPiles: [center0, center1],
    phase: 'playing',
    spitAvailable: false,
  };
  return recomputeStuck(next);
}

function spitFlip(p: PlayerState): { player: PlayerState; flipped: Card | null } {
  if (p.spitPile.length === 0) return { player: p, flipped: null };
  const flipped = p.spitPile[p.spitPile.length - 1]!;
  return {
    player: { ...p, spitPile: p.spitPile.slice(0, -1) },
    flipped,
  };
}

// ─── Adjacency ─────────────────────────────────────────────────────

function isAdjacent(a: Rank, b: Rank, wrap: boolean): boolean {
  const ia = RANK_INDEX[a];
  const ib = RANK_INDEX[b];
  const diff = Math.abs(ia - ib);
  if (diff === 1) return true;
  if (wrap && diff === RANK_ORDER.length - 1) return true;
  return false;
}

export function canPlayOn(card: Card, top: Card | null, cfg: SpitConfig): boolean {
  if (!top) return false;
  return isAdjacent(card.rank, top.rank, cfg.wrapRanks);
}

// ─── Legal plays + stuck detection ─────────────────────────────────

export function legalPlays(state: GameState, playerId: string): Action[] {
  if (state.phase !== 'playing') return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const out: Action[] = [];
  for (let col = 0; col < 5; col++) {
    const column = player.columns[col];
    if (!column || column.length === 0) continue;
    const top = column[column.length - 1]!;
    for (const ci of [0, 1] as const) {
      const centerTop = state.centerPiles[ci][state.centerPiles[ci].length - 1] ?? null;
      if (canPlayOn(top, centerTop, state.config)) {
        out.push({
          kind: 'play', playerId,
          columnIndex: col as ColumnIndex,
          centerIndex: ci,
        });
      }
    }
  }
  return out;
}

export function isStuck(state: GameState, playerId: string): boolean {
  return legalPlays(state, playerId).length === 0;
}

export function isBothStuck(state: GameState): boolean {
  return state.players.every((p) => legalPlays(state, p.id).length === 0);
}

function recomputeStuck(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  const both = isBothStuck(state);
  // Spit becomes available iff both stuck. If both stuck AND both spit
  // piles empty, we have a true stalemate — handled by a dedicated flow.
  return { ...state, spitAvailable: both };
}

// ─── applyAction ───────────────────────────────────────────────────

export function applyAction(
  state: GameState,
  action: Action,
  timestamp: number,
): GameState {
  try {
    const next = applyActionInner(state, action);
    return {
      ...next,
      actionLog: [...state.actionLog, { action, timestamp, resolution: 'accepted' }],
    };
  } catch (err) {
    return {
      ...state,
      actionLog: [
        ...state.actionLog,
        {
          action, timestamp,
          resolution: 'rejected',
          reason: err instanceof Error ? err.message : String(err),
        },
      ],
    };
  }
}

function applyActionInner(state: GameState, action: Action): GameState {
  if (state.phase === 'matchOver') throw new Error('Match is over');
  switch (action.kind) {
    case 'start':
      return start(state);
    case 'play':
      return applyPlay(state, action);
    case 'spit':
      return applySpit(state, action);
    case 'slap':
      return applySlap(state, action);
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function applyPlay(
  state: GameState,
  a: Extract<Action, { kind: 'play' }>,
): GameState {
  if (state.phase !== 'playing') throw new Error('Not in play phase');
  const pIndex = state.players.findIndex((p) => p.id === a.playerId);
  if (pIndex < 0) throw new Error(`Unknown player ${a.playerId}`);
  if (a.columnIndex < 0 || a.columnIndex > 4) {
    throw new Error(`Invalid columnIndex ${a.columnIndex}`);
  }
  if (a.centerIndex !== 0 && a.centerIndex !== 1) {
    throw new Error(`Invalid centerIndex ${a.centerIndex}`);
  }
  const player = state.players[pIndex]!;
  const column = player.columns[a.columnIndex];
  if (!column || column.length === 0) {
    throw new Error(`Column ${a.columnIndex} is empty`);
  }
  const top = column[column.length - 1]!;
  const centerTop = state.centerPiles[a.centerIndex][state.centerPiles[a.centerIndex].length - 1] ?? null;
  if (!canPlayOn(top, centerTop, state.config)) {
    throw new Error(`Cannot play ${top.rank} on ${centerTop?.rank ?? 'empty'}`);
  }
  const newColumn = column.slice(0, -1);
  const newColumns = player.columns.map((c, i) => (i === a.columnIndex ? newColumn : c));
  const newPlayer: PlayerState = { ...player, columns: newColumns };
  const newPlayers: [PlayerState, PlayerState] = [...state.players] as [PlayerState, PlayerState];
  newPlayers[pIndex] = newPlayer;
  const newCenters: [Card[], Card[]] = [
    a.centerIndex === 0 ? [...state.centerPiles[0], top] : state.centerPiles[0],
    a.centerIndex === 1 ? [...state.centerPiles[1], top] : state.centerPiles[1],
  ];
  const next: GameState = {
    ...state,
    players: newPlayers,
    centerPiles: newCenters,
  };
  return recomputeStuck(next);
}

function applySpit(
  state: GameState,
  a: Extract<Action, { kind: 'spit' }>,
): GameState {
  if (state.phase !== 'playing') throw new Error('Not in play phase');
  const caller = state.players.find((p) => p.id === a.playerId);
  if (!caller) throw new Error(`Unknown player ${a.playerId}`);
  if (!isBothStuck(state)) {
    throw new Error('Spit is only legal when both players are stuck');
  }
  // Flip one card per non-empty spit pile onto the respective centre.
  const [p1, p2] = state.players;
  const f1 = spitFlip(p1);
  const f2 = spitFlip(p2);
  const bothEmpty = !f1.flipped && !f2.flipped;
  if (bothEmpty) {
    // Stalemate — resolve by shortest-stockpile rule (canonical).
    return resolveStalemate(state);
  }
  const newCenters: [Card[], Card[]] = [
    f1.flipped ? [...state.centerPiles[0], f1.flipped] : state.centerPiles[0],
    f2.flipped ? [...state.centerPiles[1], f2.flipped] : state.centerPiles[1],
  ];
  const next: GameState = {
    ...state,
    players: [f1.player, f2.player],
    centerPiles: newCenters,
    spitAvailable: false,
  };
  return recomputeStuck(next);
}

function resolveStalemate(state: GameState): GameState {
  if (!state.config.stalemateShortestWins) {
    return { ...state, phase: 'roundOver', roundWinnerId: null };
  }
  const c0 = state.players[0].columns.reduce((s, c) => s + c.length, 0);
  const c1 = state.players[1].columns.reduce((s, c) => s + c.length, 0);
  let winnerId: string | null = null;
  if (c0 < c1) winnerId = state.players[0].id;
  else if (c1 < c0) winnerId = state.players[1].id;
  // Tie — no declared winner; leave as draw.
  if (winnerId === null) {
    return { ...state, phase: 'roundOver', roundWinnerId: null };
  }
  return endRound(state, winnerId, null);
}

function applySlap(
  state: GameState,
  a: Extract<Action, { kind: 'slap' }>,
): GameState {
  if (state.phase !== 'playing') throw new Error('Not in play phase');
  const pIndex = state.players.findIndex((p) => p.id === a.playerId);
  if (pIndex < 0) throw new Error(`Unknown player ${a.playerId}`);
  if (a.centerIndex !== 0 && a.centerIndex !== 1) {
    throw new Error(`Invalid centerIndex ${a.centerIndex}`);
  }
  const player = state.players[pIndex]!;
  const stockRemaining = player.columns.reduce((s, c) => s + c.length, 0);
  if (stockRemaining !== 0) {
    throw new Error('Slap requires all stockpile columns to be empty');
  }
  return endRound(state, a.playerId, a.centerIndex);
}

function endRound(
  state: GameState,
  winnerId: string,
  slappedCenter: CenterIndex | null,
): GameState {
  // Allocate centre piles: winner takes the slapped pile (or, in the
  // stalemate case, the smaller pile). Loser takes the other.
  const winnerIdx = state.players.findIndex((p) => p.id === winnerId);
  const loserIdx = winnerIdx === 0 ? 1 : 0;
  const winner = state.players[winnerIdx]!;
  const loser = state.players[loserIdx]!;
  const s0 = state.centerPiles[0].length;
  const s1 = state.centerPiles[1].length;
  let winnerCenterIdx: CenterIndex;
  if (slappedCenter !== null) {
    winnerCenterIdx = slappedCenter;
  } else {
    winnerCenterIdx = s0 <= s1 ? 0 : 1;
  }
  const loserCenterIdx: CenterIndex = winnerCenterIdx === 0 ? 1 : 0;

  // Build each player's new deck.
  const winnerLeftoverColumns = winner.columns.flat();
  const loserLeftoverColumns = loser.columns.flat();
  const winnerNewDeck = [
    ...state.centerPiles[winnerCenterIdx],
    ...winner.spitPile,
    ...winnerLeftoverColumns, // usually empty for winner, but include for safety
  ];
  const loserNewDeck = [
    ...state.centerPiles[loserCenterIdx],
    ...loser.spitPile,
    ...loserLeftoverColumns,
  ];

  const winnerLayout = buildLayout(winnerNewDeck);
  const loserLayout = buildLayout(loserNewDeck);

  const newPlayers: [PlayerState, PlayerState] = [
    { ...state.players[0], outOfMatch: state.players[0].outOfMatch },
    { ...state.players[1], outOfMatch: state.players[1].outOfMatch },
  ];
  newPlayers[winnerIdx] = {
    ...winner,
    columns: winnerLayout.columns,
    spitPile: winnerLayout.spitPile,
    outOfMatch: winnerLayout.columns.every((c) => c.length === 0),
  };
  newPlayers[loserIdx] = {
    ...loser,
    columns: loserLayout.columns,
    spitPile: loserLayout.spitPile,
    outOfMatch: loserLayout.columns.every((c) => c.length === 0),
  };

  const matchOver =
    !state.config.playToMatchEnd ||
    newPlayers[0].outOfMatch ||
    newPlayers[1].outOfMatch;

  const matchWinnerId = matchOver
    ? newPlayers[0].outOfMatch && !newPlayers[1].outOfMatch ? newPlayers[1].id
      : !newPlayers[0].outOfMatch && newPlayers[1].outOfMatch ? newPlayers[0].id
      : !state.config.playToMatchEnd ? winnerId
      : null
    : null;

  return {
    ...state,
    players: newPlayers,
    centerPiles: [[], []],
    phase: matchOver ? 'matchOver' : 'roundOver',
    spitAvailable: false,
    roundNumber: state.roundNumber,
    roundWinnerId: winnerId,
    matchWinnerId,
  };
}

/** Starts the next round (typically the adapter calls this after the UI
 *  has shown the "Round over — [winner] takes smaller pile" overlay). */
export function startNextRound(state: GameState): GameState {
  if (state.phase !== 'roundOver') return state;
  const p1Flip = spitFlip(state.players[0]);
  const p2Flip = spitFlip(state.players[1]);
  const newPlayers: [PlayerState, PlayerState] = [p1Flip.player, p2Flip.player];
  const centers: [Card[], Card[]] = [
    p1Flip.flipped ? [p1Flip.flipped] : [],
    p2Flip.flipped ? [p2Flip.flipped] : [],
  ];
  const next: GameState = {
    ...state,
    players: newPlayers,
    centerPiles: centers,
    phase: 'playing',
    spitAvailable: false,
    roundNumber: state.roundNumber + 1,
    roundWinnerId: null,
  };
  return recomputeStuck(next);
}

// ─── Public view ───────────────────────────────────────────────────

export interface PublicPlayerView {
  id: string;
  columnTops: Array<Card | null>;
  columnDepths: number[];
  spitPileCount: number;
  outOfMatch: boolean;
}

export interface PublicGameState {
  players: PublicPlayerView[];
  centerTops: [Card | null, Card | null];
  centerCounts: [number, number];
  phase: Phase;
  spitAvailable: boolean;
  roundNumber: number;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
}

export function getPublicView(state: GameState, _viewerId: string): PublicGameState {
  return {
    players: state.players.map((p) => ({
      id: p.id,
      columnTops: p.columns.map((c) => c[c.length - 1] ?? null),
      columnDepths: p.columns.map((c) => c.length),
      spitPileCount: p.spitPile.length,
      outOfMatch: p.outOfMatch,
    })),
    centerTops: [
      state.centerPiles[0][state.centerPiles[0].length - 1] ?? null,
      state.centerPiles[1][state.centerPiles[1].length - 1] ?? null,
    ],
    centerCounts: [state.centerPiles[0].length, state.centerPiles[1].length],
    phase: state.phase,
    spitAvailable: state.spitAvailable,
    roundNumber: state.roundNumber,
    roundWinnerId: state.roundWinnerId,
    matchWinnerId: state.matchWinnerId,
  };
}

// ─── Deterministic replay ──────────────────────────────────────────

export function replay(
  playerIds: string[],
  config: Partial<SpitConfig>,
  seed: number,
  actionLog: Array<{ action: Action; timestamp: number }>,
): GameState {
  let state = newGame(playerIds, config, seed);
  for (const { action, timestamp } of actionLog) {
    state = applyAction(state, action, timestamp);
  }
  return state;
}
