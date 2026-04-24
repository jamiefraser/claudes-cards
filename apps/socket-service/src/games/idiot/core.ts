/**
 * Idiot (a.k.a. Shithead / Shed / Karma) — pure game-logic module.
 *
 * 2–5 players (single deck) or 6 players (two decks). Each player owns
 * three sequential zones — hand, face-up row, face-down row — and plays
 * from the highest-priority non-empty zone on every turn. Cards are
 * compared by rank only (suits are cosmetic). Certain ranks are "power
 * cards" that break the normal ≥-top-of-pile ordering (see §7 below).
 *
 * Deterministic via seeded PRNG. Implements the full ruleset from
 * ./README.md, including:
 *   - Pre-game swap phase (hand ↔ face-up) with per-player ready signals
 *   - Lowest-3 opener: player holding the lowest 3 (or 4, or …) starts,
 *     and canonically their first play must include that card
 *   - Power cards: 2 = reset, 10 = burn, 8 = transparent (default),
 *     7 = lower-next (opt-in variant)
 *   - Four-of-a-kind-on-top burn (same rank stacked across turns)
 *   - Zone progression: hand → (face-up, once stock empty) → face-down
 *   - Blind face-down plays that may force a pick-up if illegal
 *   - Placement-based finishing; game ends when only the "Idiot" is left
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

/** Rank ordering used for ≥ / ≤ comparisons. 2/10/8 break the ordering
 *  through their power-card effects, not through this map. */
const RANK_VALUE: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

export function rankValue(rank: Rank): number {
  return RANK_VALUE[rank];
}

export type Zone = 'hand' | 'faceUp' | 'faceDown';

export interface PlayerState {
  id: string;
  hand: Card[];
  faceUp: Card[];
  faceDown: Card[];
  /** Pre-game swap phase flag. Transitions to `play` once all true. */
  ready: boolean;
  /** 1 = first to empty every zone, 2 = second, etc. `null` while playing. */
  finishedPlace: number | null;
}

export type PileRequirement =
  | { kind: 'any' }
  | { kind: 'geq'; rank: Rank }
  | { kind: 'leq'; rank: Rank };

export type Phase = 'swap' | 'play' | 'gameOver';

export type Action =
  | { kind: 'swap'; playerId: string; handCardId: string; faceUpCardId: string }
  | { kind: 'ready'; playerId: string }
  | { kind: 'playFromHand'; playerId: string; cardIds: string[] }
  | { kind: 'playFromFaceUp'; playerId: string; cardIds: string[] }
  | { kind: 'playFromFaceDown'; playerId: string; cardId: string }
  | { kind: 'pickUpPile'; playerId: string };

export interface IdiotConfig {
  /**
   * Transparent = 8 stacks like glass: next player still plays against
   * whatever was underneath the 8. `normal` = 8 acts like any other rank.
   * Default `transparent`.
   */
  eightMode: 'transparent' | 'normal';
  /** Opt-in variant: after a 7, next card must be ≤ 7. Default false. */
  sevensLower: boolean;
  /** Canonical: face-up zone unlocks only once stock is exhausted. */
  faceUpRequiresEmptyStock: boolean;
  /** Canonical: opener's first play must include the lowest 3 (or 4, …). */
  firstPlayMustIncludeLowest: boolean;
  /** Allow pickUpPile even when legal plays exist. Default false. */
  allowVoluntaryPickup: boolean;
  /** Number of decks; default 1, forced to 2 for ≥ 6 players. */
  decks: 1 | 2;
}

export const DEFAULT_CONFIG: IdiotConfig = {
  eightMode: 'transparent',
  sevensLower: false,
  faceUpRequiresEmptyStock: true,
  firstPlayMustIncludeLowest: true,
  allowVoluntaryPickup: false,
  decks: 1,
};

export interface GameState {
  players: PlayerState[];
  stock: Card[];
  /** Discard[last] is the top of the pile. */
  discard: Card[];
  /** Cards removed from play via burn (10 or four-of-a-kind). */
  burned: Card[];
  pileRequirement: PileRequirement;
  currentPlayerIndex: number;
  direction: 1 | -1;
  phase: Phase;
  turnNumber: number;
  roundNumber: number;
  seed: number;
  config: IdiotConfig;
  /**
   * Ordered list of player IDs that have finished (1st, 2nd, …). The
   * remaining un-finished player is the Idiot.
   */
  finishedOrder: string[];
  /**
   * Opener-rule state: the ID of the card the first play must include,
   * or null once the obligation has been fulfilled (or `firstPlayMustIncludeLowest`
   * is off). Cleared as soon as any play includes that card id.
   */
  firstPlayLowestCardId: string | null;
}

// ─── Deck construction ──────────────────────────────────────────────

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
];

function buildDeck(decks: 1 | 2, seed: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ suit, rank, id: `d${d}-${rank}${suit}` });
      }
    }
  }
  const rng = mulberry32(deriveSeed(seed, 0xd1ce));
  shuffleInPlace(cards, rng);
  return cards;
}

// ─── Setup ──────────────────────────────────────────────────────────

export function newGame(
  playerIds: string[],
  config: Partial<IdiotConfig> = {},
  seed = 1,
): GameState {
  if (playerIds.length < 2 || playerIds.length > 6) {
    throw new Error('Idiot requires 2–6 players');
  }
  // Force two decks at 6p; spec §1 note.
  const decks: 1 | 2 = playerIds.length >= 6 ? 2 : (config.decks ?? DEFAULT_CONFIG.decks);
  const cfg: IdiotConfig = { ...DEFAULT_CONFIG, ...config, decks };

  const stock = buildDeck(cfg.decks, seed);

  const players: PlayerState[] = playerIds.map((id) => ({
    id,
    hand: [],
    faceUp: [],
    faceDown: [],
    ready: false,
    finishedPlace: null,
  }));

  // Deal 3 face-down, 3 face-up, 3 hand to each player — in that order
  // so the face-down row is visually "under" the face-up row in any UI.
  for (let i = 0; i < 3; i++) for (const p of players) p.faceDown.push(stock.pop()!);
  for (let i = 0; i < 3; i++) for (const p of players) p.faceUp.push(stock.pop()!);
  for (let i = 0; i < 3; i++) for (const p of players) p.hand.push(stock.pop()!);

  // Opener: the player holding the lowest 3 (or lowest 4, etc.) starts.
  // Tiebreak by seat order from index 0. Canonical first-play constraint
  // requires that card to be included in the opening play.
  const { openerIndex, openingCardId } = pickOpener(players);

  return {
    players,
    stock,
    discard: [],
    burned: [],
    pileRequirement: { kind: 'any' },
    currentPlayerIndex: openerIndex,
    direction: 1,
    phase: 'swap',
    turnNumber: 0,
    roundNumber: 1,
    seed,
    config: cfg,
    finishedOrder: [],
    firstPlayLowestCardId: cfg.firstPlayMustIncludeLowest ? openingCardId : null,
  };
}

/** Walk ranks 3 → A and return the first (player, card-id) that holds it. */
function pickOpener(players: PlayerState[]): {
  openerIndex: number;
  openingCardId: string | null;
} {
  // Only cards in HAND count for opener determination (canonical rule).
  for (const rank of RANKS) {
    if (rank === '2') continue; // 2 is a power card, not a valid "lowest"
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      const match = p.hand.find((c) => c.rank === rank);
      if (match) return { openerIndex: i, openingCardId: match.id };
    }
  }
  // Degenerate — no non-2 cards at all? Just pick seat 0, no constraint.
  return { openerIndex: 0, openingCardId: null };
}

// ─── Rank legality helpers ──────────────────────────────────────────

/** Is `rank` a legal play given `req`? Power cards short-circuit. */
export function rankIsLegal(rank: Rank, req: PileRequirement): boolean {
  // 2 and 10 are always legal (reset / burn).
  if (rank === '2' || rank === '10') return true;
  const v = RANK_VALUE[rank];
  if (req.kind === 'any') return true;
  if (req.kind === 'geq') return v >= RANK_VALUE[req.rank];
  if (req.kind === 'leq') return v <= RANK_VALUE[req.rank];
  return false;
}

/**
 * Determine the pile requirement AFTER a rank is played, given the
 * requirement BEFORE the play and the current config. This is the
 * trickiest piece of rule-logic: transparent 8s keep the pre-play
 * requirement; 2s reset; 10s reset (and burn separately); 7-lower
 * variant inverts; everything else becomes `geq rank`.
 */
function nextRequirement(
  rank: Rank,
  prev: PileRequirement,
  cfg: IdiotConfig,
  pileEmptyAfterBurn: boolean,
): PileRequirement {
  if (pileEmptyAfterBurn) return { kind: 'any' };
  if (rank === '2') return { kind: 'any' };
  if (rank === '10') return { kind: 'any' }; // burned separately
  if (rank === '8' && cfg.eightMode === 'transparent') return prev;
  if (rank === '7' && cfg.sevensLower) return { kind: 'leq', rank: '7' };
  return { kind: 'geq', rank };
}

/** Returns the player's currently-active zone (or null if finished). */
export function activeZoneOf(
  state: GameState,
  player: PlayerState,
): Zone | null {
  if (player.finishedPlace !== null) return null;
  if (player.hand.length > 0) return 'hand';
  if (player.faceUp.length > 0) {
    if (state.config.faceUpRequiresEmptyStock && state.stock.length > 0) {
      // Hand is empty but stock still has cards — in practice this can't
      // happen because every hand play auto-refills from stock. We surface
      // 'hand' so that any code path that tries to play from face-up in
      // this state correctly treats the move as illegal.
      return 'hand';
    }
    return 'faceUp';
  }
  if (player.faceDown.length > 0) return 'faceDown';
  return null;
}

// ─── legalActions ──────────────────────────────────────────────────

export function legalActions(state: GameState, playerId: string): Action[] {
  if (state.phase === 'gameOver') return [];

  // Swap phase: actions are (swap, ready). Everyone can act in parallel.
  if (state.phase === 'swap') {
    const p = state.players.find((x) => x.id === playerId);
    if (!p || p.ready) return [];
    const actions: Action[] = [{ kind: 'ready', playerId }];
    for (const hCard of p.hand) {
      for (const fCard of p.faceUp) {
        actions.push({
          kind: 'swap', playerId,
          handCardId: hCard.id, faceUpCardId: fCard.id,
        });
      }
    }
    return actions;
  }

  // Play phase: only the current player may act.
  const current = state.players[state.currentPlayerIndex]!;
  if (current.id !== playerId) return [];
  if (current.finishedPlace !== null) return [];

  const zone = activeZoneOf(state, current);
  if (!zone) return [];

  const out: Action[] = [];

  if (zone === 'hand' || zone === 'faceUp') {
    const source = zone === 'hand' ? current.hand : current.faceUp;
    // Bucket cards by rank (first-occurrence order) so that enumeration
    // is stable and deterministic — tests depend on this ordering.
    const byRank = new Map<Rank, Card[]>();
    for (const c of source) {
      if (!byRank.has(c.rank)) byRank.set(c.rank, []);
      byRank.get(c.rank)!.push(c);
    }
    for (const [rank, cards] of byRank) {
      if (!rankIsLegal(rank, state.pileRequirement)) continue;
      if (state.firstPlayLowestCardId !== null) {
        // Opener's first play must include the lowest-3 card. Prune any
        // play that could legally satisfy the pile but doesn't touch it.
        const hasLowest = cards.some((c) => c.id === state.firstPlayLowestCardId);
        if (!hasLowest) continue;
      }
      const action = zone === 'hand' ? 'playFromHand' as const : 'playFromFaceUp' as const;
      // "Play one" and "play all" are the two enumerated choices. Subsets
      // in between are accepted at applyAction time; tests / UI just don't
      // enumerate them because the strategic value is negligible.
      out.push({ kind: action, playerId, cardIds: [cards[0]!.id] });
      if (cards.length > 1) {
        out.push({ kind: action, playerId, cardIds: cards.map((c) => c.id) });
      }
    }
  } else {
    // faceDown — one per card, blind. Player never sees rank.
    for (const c of current.faceDown) {
      out.push({ kind: 'playFromFaceDown', playerId, cardId: c.id });
    }
  }

  // Pick-up is offered when no legal plays exist, or always if config allows.
  if (out.length === 0 || state.config.allowVoluntaryPickup) {
    out.push({ kind: 'pickUpPile', playerId });
  }
  return out;
}

// ─── applyAction ───────────────────────────────────────────────────

export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase === 'gameOver') throw new Error('Game is over');

  switch (action.kind) {
    case 'swap':  return applySwap(state, action);
    case 'ready': return applyReady(state, action);
    case 'playFromHand':     return applyPlayFromHand(state, action);
    case 'playFromFaceUp':   return applyPlayFromFaceUp(state, action);
    case 'playFromFaceDown': return applyPlayFromFaceDown(state, action);
    case 'pickUpPile':       return applyPickUp(state, action);
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function applySwap(state: GameState, a: Extract<Action, { kind: 'swap' }>): GameState {
  if (state.phase !== 'swap') throw new Error('Not in swap phase');
  const players = state.players.map((p) => {
    if (p.id !== a.playerId) return p;
    if (p.ready) throw new Error('Player already ready');
    const handIdx = p.hand.findIndex((c) => c.id === a.handCardId);
    const fuIdx = p.faceUp.findIndex((c) => c.id === a.faceUpCardId);
    if (handIdx < 0) throw new Error(`hand card ${a.handCardId} not found`);
    if (fuIdx < 0) throw new Error(`face-up card ${a.faceUpCardId} not found`);
    const newHand = [...p.hand];
    const newFu = [...p.faceUp];
    const h = newHand[handIdx]!;
    const f = newFu[fuIdx]!;
    newHand[handIdx] = f;
    newFu[fuIdx] = h;
    return { ...p, hand: newHand, faceUp: newFu };
  });
  // Swap may have changed the opener's lowest card — recompute, but only
  // while still in swap phase and only if the opener obligation is live.
  let firstPlayLowestCardId = state.firstPlayLowestCardId;
  let currentPlayerIndex = state.currentPlayerIndex;
  if (state.config.firstPlayMustIncludeLowest) {
    const { openerIndex, openingCardId } = pickOpener(players);
    firstPlayLowestCardId = openingCardId;
    currentPlayerIndex = openerIndex;
  }
  return { ...state, players, firstPlayLowestCardId, currentPlayerIndex };
}

function applyReady(state: GameState, a: Extract<Action, { kind: 'ready' }>): GameState {
  if (state.phase !== 'swap') throw new Error('Not in swap phase');
  const players = state.players.map((p) =>
    p.id === a.playerId ? { ...p, ready: true } : p,
  );
  const allReady = players.every((p) => p.ready);
  if (!allReady) return { ...state, players };
  // Lock in opener once everyone has committed their swaps.
  const { openerIndex, openingCardId } = pickOpener(players);
  return {
    ...state,
    players,
    phase: 'play',
    currentPlayerIndex: openerIndex,
    firstPlayLowestCardId: state.config.firstPlayMustIncludeLowest ? openingCardId : null,
    turnNumber: 1,
  };
}

// ─── Play helpers ───────────────────────────────────────────────────

function applyPlayFromHand(
  state: GameState,
  a: Extract<Action, { kind: 'playFromHand' }>,
): GameState {
  ensurePlayPhase(state, a.playerId);
  const current = state.players[state.currentPlayerIndex]!;
  if (activeZoneOf(state, current) !== 'hand') {
    throw new Error('Active zone is not hand');
  }
  const cards = takeSameRankCards(current.hand, a.cardIds);
  return executePlay(state, current, cards, 'hand');
}

function applyPlayFromFaceUp(
  state: GameState,
  a: Extract<Action, { kind: 'playFromFaceUp' }>,
): GameState {
  ensurePlayPhase(state, a.playerId);
  const current = state.players[state.currentPlayerIndex]!;
  if (activeZoneOf(state, current) !== 'faceUp') {
    throw new Error('Active zone is not faceUp');
  }
  const cards = takeSameRankCards(current.faceUp, a.cardIds);
  return executePlay(state, current, cards, 'faceUp');
}

function applyPlayFromFaceDown(
  state: GameState,
  a: Extract<Action, { kind: 'playFromFaceDown' }>,
): GameState {
  ensurePlayPhase(state, a.playerId);
  const current = state.players[state.currentPlayerIndex]!;
  if (activeZoneOf(state, current) !== 'faceDown') {
    throw new Error('Active zone is not faceDown');
  }
  const idx = current.faceDown.findIndex((c) => c.id === a.cardId);
  if (idx < 0) throw new Error(`faceDown card ${a.cardId} not found`);
  const card = current.faceDown[idx]!;
  // Remove from faceDown regardless of legality (spec §5: "face-down count
  // decreases by one either way — it's exposed now").
  const newFaceDown = [...current.faceDown.slice(0, idx), ...current.faceDown.slice(idx + 1)];
  const legal = rankIsLegal(card.rank, state.pileRequirement);

  if (legal) {
    const updated = updatePlayer(state, current.id, { faceDown: newFaceDown });
    return executePlay(updated, updated.players[updated.currentPlayerIndex]!, [card], 'faceDown');
  }
  // Illegal blind play → picks up pile + the exposed card.
  const pickedUp = [...state.discard, card];
  const newPlayers = state.players.map((p) =>
    p.id === current.id
      ? { ...p, faceDown: newFaceDown, hand: [...p.hand, ...pickedUp] }
      : p,
  );
  return advanceTurn(
    {
      ...state,
      players: newPlayers,
      discard: [],
      pileRequirement: { kind: 'any' },
    },
    current.id,
    { samePlayerAgain: false },
  );
}

function applyPickUp(
  state: GameState,
  a: Extract<Action, { kind: 'pickUpPile' }>,
): GameState {
  ensurePlayPhase(state, a.playerId);
  const current = state.players[state.currentPlayerIndex]!;
  if (!state.config.allowVoluntaryPickup && legalHasAnyPlay(state, current)) {
    throw new Error('pickUpPile not allowed when legal plays exist');
  }
  const pickedUp = [...state.discard];
  const newPlayers = state.players.map((p) =>
    p.id === current.id ? { ...p, hand: [...p.hand, ...pickedUp] } : p,
  );
  return advanceTurn(
    { ...state, players: newPlayers, discard: [], pileRequirement: { kind: 'any' } },
    current.id,
    { samePlayerAgain: false },
  );
}

function legalHasAnyPlay(state: GameState, player: PlayerState): boolean {
  const zone = activeZoneOf(state, player);
  if (zone === null) return false;
  // Face-down is a blind play — always available while face-down has cards.
  if (zone === 'faceDown') return player.faceDown.length > 0;
  const source = zone === 'hand' ? player.hand : player.faceUp;
  for (const c of source) {
    if (rankIsLegal(c.rank, state.pileRequirement)) {
      if (state.firstPlayLowestCardId !== null
          && c.id !== state.firstPlayLowestCardId
          && !source.some((s) => s.id === state.firstPlayLowestCardId && s.rank === c.rank)) {
        continue;
      }
      return true;
    }
  }
  return false;
}

function takeSameRankCards(source: Card[], cardIds: string[]): Card[] {
  if (cardIds.length === 0) throw new Error('Play must include ≥ 1 card');
  const picked: Card[] = [];
  for (const id of cardIds) {
    const c = source.find((x) => x.id === id);
    if (!c) throw new Error(`Card ${id} not in source zone`);
    picked.push(c);
  }
  const rank = picked[0]!.rank;
  if (picked.some((c) => c.rank !== rank)) {
    throw new Error('Multi-card plays must share a rank');
  }
  return picked;
}

/**
 * Core play resolver — handles:
 *   - Legality against pileRequirement
 *   - Opener's first-play-must-include-lowest obligation
 *   - Power-card effects (2, 10, 8-transparent, 7-lower)
 *   - Four-of-a-kind burn after stacking
 *   - Draw-back-to-3 from stock when playing from hand
 *   - Win detection + placement
 *   - Same-player-plays-again on burn; otherwise turn advance
 */
function executePlay(
  state: GameState,
  player: PlayerState,
  cards: Card[],
  zone: Zone,
): GameState {
  const rank = cards[0]!.rank;
  // Face-down rank is only decided at flip time; caller pre-validates faceDown.
  if (zone !== 'faceDown' && !rankIsLegal(rank, state.pileRequirement)) {
    throw new Error(`Cannot play ${rank} on ${describeRequirement(state.pileRequirement)}`);
  }
  if (state.firstPlayLowestCardId !== null) {
    if (!cards.some((c) => c.id === state.firstPlayLowestCardId)) {
      throw new Error('Opener must include the lowest-rank card on the first play');
    }
  }

  // Remove played cards from the owning zone.
  const cardIdSet = new Set(cards.map((c) => c.id));
  let newHand = player.hand, newFaceUp = player.faceUp, newFaceDown = player.faceDown;
  if (zone === 'hand') newHand = player.hand.filter((c) => !cardIdSet.has(c.id));
  if (zone === 'faceUp') newFaceUp = player.faceUp.filter((c) => !cardIdSet.has(c.id));
  if (zone === 'faceDown') newFaceDown = player.faceDown.filter((c) => !cardIdSet.has(c.id));

  let newDiscard = [...state.discard, ...cards];
  let newBurned = state.burned;

  // 10 = explicit burn. Mechanic is unconditional regardless of what's
  // underneath. Same player plays again.
  let samePlayerAgain = false;
  let pileEmptyAfterBurn = false;
  if (rank === '10') {
    newBurned = [...newBurned, ...newDiscard];
    newDiscard = [];
    samePlayerAgain = true;
    pileEmptyAfterBurn = true;
  }

  // Four-of-a-kind on top → burn. Triggers on top(4) same rank after stacking.
  if (!pileEmptyAfterBurn && topFourSameRank(newDiscard)) {
    newBurned = [...newBurned, ...newDiscard];
    newDiscard = [];
    samePlayerAgain = true;
    pileEmptyAfterBurn = true;
  }

  // Refill from stock — only when the play originated from the hand zone.
  let newStock = state.stock;
  if (zone === 'hand') {
    const refilled = [...newHand];
    while (refilled.length < 3 && newStock.length > 0) {
      refilled.push(newStock[newStock.length - 1]!);
      newStock = newStock.slice(0, -1);
    }
    newHand = refilled;
  }

  // Clear opener obligation on first fulfillment.
  const firstPlayLowestCardId =
    state.firstPlayLowestCardId !== null
      && cards.some((c) => c.id === state.firstPlayLowestCardId)
      ? null
      : state.firstPlayLowestCardId;

  // Compute next requirement. 8-transparent keeps the pre-play requirement
  // (so a 5-top + 8 still demands ≥ 5 for the next player).
  const nextReq = nextRequirement(
    rank, state.pileRequirement, state.config, pileEmptyAfterBurn,
  );

  // Rebuild players with the updated hand/faceUp/faceDown + placement.
  const mutated: PlayerState = {
    ...player,
    hand: newHand,
    faceUp: newFaceUp,
    faceDown: newFaceDown,
  };
  let players = state.players.map((p) => (p.id === player.id ? mutated : p));

  // Win check: all three zones empty and not already placed.
  const isEmpty = mutated.hand.length === 0 && mutated.faceUp.length === 0 && mutated.faceDown.length === 0;
  let finishedOrder = state.finishedOrder;
  if (isEmpty && mutated.finishedPlace === null) {
    const place = finishedOrder.length + 1;
    finishedOrder = [...finishedOrder, mutated.id];
    players = players.map((p) =>
      p.id === mutated.id ? { ...p, finishedPlace: place } : p,
    );
    // A burn that empties the winner's zones still wins — the spec is
    // explicit. No "must play again" for a finished player.
    samePlayerAgain = false;
  }

  // End condition: only one player left un-finished → game over.
  const stillIn = players.filter((p) => p.finishedPlace === null);
  const gameOver = stillIn.length <= 1;

  let nextState: GameState = {
    ...state,
    players,
    stock: newStock,
    discard: newDiscard,
    burned: newBurned,
    pileRequirement: nextReq,
    finishedOrder,
    firstPlayLowestCardId,
  };

  if (gameOver) {
    return { ...nextState, phase: 'gameOver' };
  }

  return advanceTurn(nextState, player.id, { samePlayerAgain });
}

function topFourSameRank(discard: Card[]): boolean {
  if (discard.length < 4) return false;
  const top = discard[discard.length - 1]!.rank;
  for (let i = discard.length - 1; i > discard.length - 5; i--) {
    if (discard[i]!.rank !== top) return false;
  }
  return true;
}

function advanceTurn(
  state: GameState,
  actingPlayerId: string,
  opts: { samePlayerAgain: boolean },
): GameState {
  if (opts.samePlayerAgain) {
    return { ...state, turnNumber: state.turnNumber + 1 };
  }
  const nextIdx = findNextPlayer(state, actingPlayerId);
  return { ...state, currentPlayerIndex: nextIdx, turnNumber: state.turnNumber + 1 };
}

function findNextPlayer(state: GameState, fromId: string): number {
  const n = state.players.length;
  const fromIdx = state.players.findIndex((p) => p.id === fromId);
  for (let step = 1; step <= n; step++) {
    const idx = (fromIdx + state.direction * step + n * n) % n;
    if (state.players[idx]!.finishedPlace === null) return idx;
  }
  // No un-finished player found — game is over (caller checks).
  return fromIdx;
}

function updatePlayer(
  state: GameState,
  playerId: string,
  patch: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, ...patch } : p,
    ),
  };
}

function ensurePlayPhase(state: GameState, playerId: string): void {
  if (state.phase !== 'play') throw new Error('Not in play phase');
  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    throw new Error(`Not ${playerId}'s turn`);
  }
}

function describeRequirement(req: PileRequirement): string {
  if (req.kind === 'any') return 'any';
  return `${req.kind} ${req.rank}`;
}

// ─── Public view ───────────────────────────────────────────────────

export interface PublicPlayerView {
  id: string;
  handCount: number;
  faceUp: Card[];
  faceDownCount: number;
  finishedPlace: number | null;
}

export interface PublicGameState {
  players: PublicPlayerView[];
  viewerHand: Card[] | null;
  stockCount: number;
  discardTop: Card | null;
  discardCount: number;
  burnedCount: number;
  pileRequirement: PileRequirement;
  currentPlayerId: string | null;
  phase: Phase;
  turnNumber: number;
  finishedOrder: string[];
  firstPlayLowestCardId: string | null;
}

export function getPublicView(state: GameState, viewerId: string): PublicGameState {
  return {
    players: state.players.map((p) => ({
      id: p.id,
      handCount: p.hand.length,
      faceUp: p.faceUp,
      faceDownCount: p.faceDown.length,
      finishedPlace: p.finishedPlace,
    })),
    viewerHand: state.players.find((p) => p.id === viewerId)?.hand ?? null,
    stockCount: state.stock.length,
    discardTop: state.discard[state.discard.length - 1] ?? null,
    discardCount: state.discard.length,
    burnedCount: state.burned.length,
    pileRequirement: state.pileRequirement,
    currentPlayerId: state.phase === 'gameOver'
      ? null
      : (state.players[state.currentPlayerIndex]?.id ?? null),
    phase: state.phase,
    turnNumber: state.turnNumber,
    finishedOrder: state.finishedOrder,
    firstPlayLowestCardId: state.firstPlayLowestCardId,
  };
}
