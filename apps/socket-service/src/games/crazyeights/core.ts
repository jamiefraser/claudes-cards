/**
 * Crazy Eights — pure game-logic module.
 *
 * No I/O, no platform types. Deterministic given a seed. The module
 * implements the full rule set specified in ./README.md, including:
 *   - 1-deck (2–5 players) / 2-deck (6–7 players) auto-selection.
 *   - Two-step 8 play: `play` transitions to `awaitingSuitChoice`; the
 *     same player must then `declareSuit`. No other action is legal
 *     between those two.
 *   - Configurable draw rule (drawUntilPlayable default, drawOne,
 *     drawThree), configurable starter-8 handling, configurable action
 *     cards (queensSkip / aceReverse / twoDrawTwo / jackSkip /
 *     pickUpStacking), and two scoring modes (penalty-accumulation
 *     default, winner-takes-points).
 *   - Blocked-round detection via a consecutive-passes counter.
 *
 * Public API (see ./README.md §API):
 *   - newGame(playerIds, config, seed): GameState
 *   - legalActions(state, playerId): Action[]
 *   - applyAction(state, action): GameState
 *   - getPublicView(state, viewerId): PublicGameState
 */

// ─── PRNG ────────────────────────────────────────────────────────────
// Tiny deterministic 32-bit PRNG (mulberry32). A fresh instance is
// minted at every point we need randomness, seeded from the base seed
// combined with tags so reshuffles don't collide with the deal shuffle.

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
  /** Stable per-game id. 2-deck games disambiguate via `_d0` / `_d1`. */
  id: string;
}

export interface PlayerState {
  id: string;
  hand: Card[];
  /** Cumulative score across rounds. */
  scoreTotal: number;
}

export type Phase =
  | 'awaitingPlay'
  | 'awaitingSuitChoice'
  | 'roundOver'
  | 'gameOver';

export type Action =
  | { kind: 'play'; playerId: string; cardId: string }
  | { kind: 'declareSuit'; playerId: string; suit: Suit }
  | { kind: 'draw'; playerId: string }
  | { kind: 'pass'; playerId: string }
  | { kind: 'reshuffle' };

export interface ActionCardConfig {
  /** Playing a Q skips the next player in the current direction. */
  queensSkip: boolean;
  /** Playing an A reverses direction. */
  aceReverse: boolean;
  /** Playing a 2 forces the next player to draw 2 (stackable). */
  twoDrawTwo: boolean;
  /** Playing a J skips the next player. */
  jackSkip: boolean;
  /** Whether 2-draw-2 penalties can be passed along by the next player's 2. */
  pickUpStacking: boolean;
}

export interface CrazyEightsConfig {
  /** 'reshuffle' (default) or 'nominate' — how to handle starter = 8. */
  starterEightRule: 'reshuffle' | 'nominate';
  /** How drawing behaves when a player cannot play. */
  drawRule: 'drawUntilPlayable' | 'drawOne' | 'drawThree';
  /** Scoring model. */
  scoringMode: 'penaltyAccumulation' | 'winnerTakesPoints';
  /** Target that ends the game. Default 100. */
  targetScore: number;
  /** How a blocked round scores. */
  blockedRoundRule: 'penaltiesToEveryone' | 'awardLowest';
  /** How the first player is chosen each round. */
  firstPlayerRule: 'randomBySeed' | 'leftOfDealer';
  /** Optional house-rule action cards. All off by default. */
  actionCards: ActionCardConfig;
}

export interface GameState {
  players: PlayerState[];
  stock: Card[];
  discard: Card[];
  activeSuit: Suit;
  currentPlayerIndex: number;
  direction: 1 | -1;
  phase: Phase;
  /** Pending 2-draw-2 penalty the next non-2 player must absorb. */
  pendingDrawPenalty: number;
  /** Used to detect blocked rounds (§9). */
  consecutivePasses: number;
  turnNumber: number;
  roundNumber: number;
  history: Action[];
  seed: number;
  config: CrazyEightsConfig;
  /** Set when phase transitions to 'roundOver' or 'gameOver'. */
  roundWinnerId: string | null;
  /** 'over' reasons: someone emptied their hand, or the round blocked. */
  blocked: boolean;
  /** True when a player's score crossed `targetScore` and the game ended. */
  gameWinnerId: string | null;
  /** For the 2-deck case, retained so the adapter / UI can label the deck. */
  deckCount: 1 | 2;
}

export interface PublicPlayerState {
  id: string;
  handCount: number;
  scoreTotal: number;
}

export interface PublicGameState {
  players: PublicPlayerState[];
  /** Viewer's own hand, in order. */
  viewerHand: Card[];
  stockCount: number;
  /** Full discard pile is public. */
  discard: Card[];
  activeSuit: Suit;
  currentPlayerId: string | null;
  direction: 1 | -1;
  phase: Phase;
  pendingDrawPenalty: number;
  turnNumber: number;
  roundNumber: number;
  history: Action[];
  roundWinnerId: string | null;
  gameWinnerId: string | null;
  blocked: boolean;
}

// ─── Defaults ───────────────────────────────────────────────────────

export const DEFAULT_ACTION_CARDS: ActionCardConfig = {
  queensSkip: false,
  aceReverse: false,
  twoDrawTwo: false,
  jackSkip: false,
  pickUpStacking: false,
};

export const DEFAULT_CONFIG: CrazyEightsConfig = {
  starterEightRule: 'reshuffle',
  drawRule: 'drawUntilPlayable',
  scoringMode: 'penaltyAccumulation',
  targetScore: 100,
  blockedRoundRule: 'penaltiesToEveryone',
  firstPlayerRule: 'randomBySeed',
  actionCards: { ...DEFAULT_ACTION_CARDS },
};

// ─── Constants ──────────────────────────────────────────────────────

const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: readonly Rank[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
];

const RANK_POINTS: Record<Rank, number> = {
  A: 1,
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 50,
  '9': 9, '10': 10,
  J: 10, Q: 10, K: 10,
};

// ─── Deck ───────────────────────────────────────────────────────────

function buildDeck(count: 1 | 2): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < count; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          suit,
          rank,
          id: count === 1 ? `${rank}${suit}` : `${rank}${suit}_d${d}`,
        });
      }
    }
  }
  return cards;
}

function chooseDeckCount(playerCount: number): 1 | 2 {
  if (playerCount < 2 || playerCount > 7) {
    throw new Error(`Crazy Eights supports 2–7 players, got ${playerCount}`);
  }
  return playerCount >= 6 ? 2 : 1;
}

function dealSize(playerCount: number): number {
  return playerCount === 2 ? 7 : 5;
}

// ─── Public API ─────────────────────────────────────────────────────

export function newGame(
  playerIds: string[],
  config: CrazyEightsConfig,
  seed: number,
): GameState {
  const deckCount = chooseDeckCount(playerIds.length);
  const perPlayer = dealSize(playerIds.length);
  const totalCards = 52 * deckCount;
  if (perPlayer * playerIds.length + 1 > totalCards) {
    // 1 card reserved for the opening discard + a bit of stock.
    throw new Error(
      `Not enough cards for ${playerIds.length} players with ${deckCount}-deck setup`,
    );
  }

  const rng = mulberry32(deriveSeed(seed, 0));
  const deck = buildDeck(deckCount);
  shuffleInPlace(deck, rng);

  const players: PlayerState[] = playerIds.map((id) => ({
    id,
    hand: [],
    scoreTotal: 0,
  }));
  // Round-robin deal.
  for (let round = 0; round < perPlayer; round++) {
    for (let p = 0; p < playerIds.length; p++) {
      players[p]!.hand.push(deck.shift()!);
    }
  }

  // Flip starter card. Under starterEightRule=reshuffle, keep flipping
  // (and pushing 8s to the bottom) until the top card isn't an 8.
  let discardTop = deck.shift()!;
  if (config.starterEightRule === 'reshuffle') {
    const startRng = mulberry32(deriveSeed(seed, 1));
    while (discardTop.rank === '8') {
      deck.push(discardTop);
      // Re-shuffle the remaining stock so the 8 isn't right back on top.
      shuffleInPlace(deck, startRng);
      discardTop = deck.shift()!;
    }
  }

  const firstIndex = pickFirstPlayer(playerIds.length, config, seed);

  const state: GameState = {
    players,
    stock: deck,
    discard: [discardTop],
    activeSuit: discardTop.suit,
    currentPlayerIndex: firstIndex,
    direction: 1,
    // If starter is an 8 and rule is 'nominate', first player must
    // declare a suit before anything else.
    phase:
      config.starterEightRule === 'nominate' && discardTop.rank === '8'
        ? 'awaitingSuitChoice'
        : 'awaitingPlay',
    pendingDrawPenalty: 0,
    consecutivePasses: 0,
    turnNumber: 0,
    roundNumber: 1,
    history: [],
    seed,
    config,
    roundWinnerId: null,
    blocked: false,
    gameWinnerId: null,
    deckCount,
  };

  return state;
}

function pickFirstPlayer(
  n: number,
  config: CrazyEightsConfig,
  seed: number,
): number {
  if (config.firstPlayerRule === 'leftOfDealer') return 1 % n;
  const rng = mulberry32(deriveSeed(seed, 2));
  return Math.floor(rng() * n);
}

export function legalActions(state: GameState, playerId: string): Action[] {
  if (state.phase === 'roundOver' || state.phase === 'gameOver') return [];

  const current = state.players[state.currentPlayerIndex]!;
  // During awaitingSuitChoice, only the current player can pick a suit.
  if (state.phase === 'awaitingSuitChoice') {
    if (playerId !== current.id) return [];
    return SUITS.map((suit) => ({ kind: 'declareSuit', playerId, suit }));
  }

  if (playerId !== current.id) return [];

  const actions: Action[] = [];
  const top = discardTop(state);

  // Pending 2-draw-2 penalty: the only legal play is another 2
  // (if pickUpStacking is on). Otherwise the player must draw.
  if (state.pendingDrawPenalty > 0) {
    if (state.config.actionCards.pickUpStacking) {
      for (const c of current.hand) {
        if (c.rank === '2' && state.config.actionCards.twoDrawTwo) {
          actions.push({ kind: 'play', playerId, cardId: c.id });
        }
      }
    }
    actions.push({ kind: 'draw', playerId });
    return actions;
  }

  for (const c of current.hand) {
    if (isLegalPlay(c, state.activeSuit, top)) {
      actions.push({ kind: 'play', playerId, cardId: c.id });
    }
  }
  const anyPlayable = actions.some((a) => a.kind === 'play');
  // Drawing is always the escape hatch when no play exists. Under
  // `drawOne` / `drawThree`, the player is ALSO allowed to draw even
  // when they have a playable (per spec §6 "draw exactly one" / "up to
  // 3") — `drawUntilPlayable` forbids voluntary drawing.
  if (!anyPlayable || state.config.drawRule !== 'drawUntilPlayable') {
    actions.push({ kind: 'draw', playerId });
  }
  return actions;
}

export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase === 'roundOver' || state.phase === 'gameOver') {
    throw new Error(`Cannot apply action in phase ${state.phase}`);
  }
  switch (action.kind) {
    case 'play': return applyPlay(state, action);
    case 'declareSuit': return applyDeclareSuit(state, action);
    case 'draw': return applyDraw(state, action);
    case 'pass': return applyPass(state, action);
    case 'reshuffle': return applyReshuffle(state);
  }
}

export function getPublicView(state: GameState, viewerId: string): PublicGameState {
  const viewer = state.players.find((p) => p.id === viewerId);
  return {
    players: state.players.map((p) => ({
      id: p.id,
      handCount: p.hand.length,
      scoreTotal: p.scoreTotal,
    })),
    viewerHand: viewer ? [...viewer.hand] : [],
    stockCount: state.stock.length,
    discard: [...state.discard],
    activeSuit: state.activeSuit,
    currentPlayerId:
      state.phase === 'gameOver' || state.phase === 'roundOver'
        ? null
        : state.players[state.currentPlayerIndex]!.id,
    direction: state.direction,
    phase: state.phase,
    pendingDrawPenalty: state.pendingDrawPenalty,
    turnNumber: state.turnNumber,
    roundNumber: state.roundNumber,
    history: [...state.history],
    roundWinnerId: state.roundWinnerId,
    gameWinnerId: state.gameWinnerId,
    blocked: state.blocked,
  };
}

// ─── Internal: action handlers ──────────────────────────────────────

function applyPlay(
  state: GameState,
  action: Extract<Action, { kind: 'play' }>,
): GameState {
  if (state.phase !== 'awaitingPlay') {
    throw new Error(`Cannot play in phase ${state.phase}`);
  }
  const current = state.players[state.currentPlayerIndex]!;
  if (action.playerId !== current.id) {
    throw new Error(`Not ${action.playerId}'s turn`);
  }
  const cardIdx = current.hand.findIndex((c) => c.id === action.cardId);
  if (cardIdx < 0) throw new Error(`Card ${action.cardId} not in hand`);
  const card = current.hand[cardIdx]!;

  // Pending 2-draw-2 penalty — only a 2 can be stacked on top (if
  // enabled). Any other card is illegal until the penalty resolves.
  if (state.pendingDrawPenalty > 0) {
    if (
      !(
        card.rank === '2' &&
        state.config.actionCards.twoDrawTwo &&
        state.config.actionCards.pickUpStacking
      )
    ) {
      throw new Error('Must draw pending penalty; cannot play this card');
    }
  } else if (!isLegalPlay(card, state.activeSuit, discardTop(state))) {
    throw new Error(
      `Illegal play: ${card.rank}${card.suit} on ${discardTop(state).rank}${discardTop(state).suit} (active ${state.activeSuit})`,
    );
  }

  // Remove card from hand, append to discard.
  const newHand = [
    ...current.hand.slice(0, cardIdx),
    ...current.hand.slice(cardIdx + 1),
  ];
  const newPlayers = state.players.map((p) =>
    p.id === current.id ? { ...p, hand: newHand } : p,
  );
  let next: GameState = {
    ...state,
    players: newPlayers,
    discard: [...state.discard, card],
    turnNumber: state.turnNumber + 1,
    history: [...state.history, action],
    consecutivePasses: 0,
  };

  // Check immediate round end — player emptied their hand.
  if (newHand.length === 0) {
    // Spec §12(14): playing an 8 as the last card still wins; no suit
    // declaration is needed. Log an auto-declareSuit with the card's
    // own suit so history remains parseable but don't gate on it.
    if (card.rank === '8') {
      next = {
        ...next,
        history: [
          ...next.history,
          { kind: 'declareSuit', playerId: current.id, suit: card.suit },
        ],
        activeSuit: card.suit,
      };
    } else {
      next = { ...next, activeSuit: card.suit };
    }
    return finishRound(next, current.id);
  }

  // Non-terminal plays:
  if (card.rank === '8') {
    // Enter suit-choice phase; same player must declare before anyone else.
    return { ...next, phase: 'awaitingSuitChoice' };
  }

  // Update activeSuit to the played card's suit.
  next = { ...next, activeSuit: card.suit };

  // Action-card effects.
  const ac = state.config.actionCards;
  if (card.rank === '2' && ac.twoDrawTwo) {
    next = { ...next, pendingDrawPenalty: state.pendingDrawPenalty + 2 };
  }
  let skip = 0;
  if ((card.rank === 'Q' && ac.queensSkip) || (card.rank === 'J' && ac.jackSkip)) {
    skip = 1;
  }
  let direction: 1 | -1 = state.direction;
  if (card.rank === 'A' && ac.aceReverse) {
    direction = (direction * -1) as 1 | -1;
    // Classic rule: with only 2 players, reversing is equivalent to
    // skipping — the same player plays again. Without this, the flip
    // would bounce the turn to the opponent.
    if (state.players.length === 2) skip = 1;
  }
  next = { ...next, direction };
  return advanceTurn(next, 1 + skip);
}

function applyDeclareSuit(
  state: GameState,
  action: Extract<Action, { kind: 'declareSuit' }>,
): GameState {
  if (state.phase !== 'awaitingSuitChoice') {
    throw new Error(`Cannot declare suit in phase ${state.phase}`);
  }
  const current = state.players[state.currentPlayerIndex]!;
  if (action.playerId !== current.id) {
    throw new Error(`Only ${current.id} can declare the suit`);
  }
  let next: GameState = {
    ...state,
    activeSuit: action.suit,
    history: [...state.history, action],
    phase: 'awaitingPlay',
  };
  // If this declareSuit followed an opening-discard 8 under 'nominate',
  // no turn-advance — first player is still to play normally.
  if (state.turnNumber === 0 && state.history.length === 0) {
    return next;
  }
  return advanceTurn(next, 1);
}

function applyDraw(
  state: GameState,
  action: Extract<Action, { kind: 'draw' }>,
): GameState {
  const current = state.players[state.currentPlayerIndex]!;
  if (action.playerId !== current.id) {
    throw new Error(`Not ${action.playerId}'s turn`);
  }

  // Pending 2-draw-2 penalty path.
  if (state.pendingDrawPenalty > 0) {
    return absorbPenalty(state, action);
  }

  switch (state.config.drawRule) {
    case 'drawUntilPlayable': return drawUntilPlayable(state, action);
    case 'drawOne': return drawFixed(state, action, 1);
    case 'drawThree': return drawFixed(state, action, 3);
  }
}

function applyPass(
  state: GameState,
  action: Extract<Action, { kind: 'pass' }>,
): GameState {
  const current = state.players[state.currentPlayerIndex]!;
  if (action.playerId !== current.id) {
    throw new Error(`Not ${action.playerId}'s turn`);
  }
  let next: GameState = {
    ...state,
    history: [...state.history, action],
    consecutivePasses: state.consecutivePasses + 1,
  };
  // Blocked if everyone has passed in sequence.
  if (next.consecutivePasses >= next.players.length) {
    return finishRoundBlocked(next);
  }
  return advanceTurn(next, 1);
}

function applyReshuffle(state: GameState): GameState {
  if (state.stock.length > 0 || state.discard.length <= 1) return state;
  return reshuffleDiscardIntoStock(state);
}

// ─── Internal: helpers ──────────────────────────────────────────────

function discardTop(state: GameState): Card {
  return state.discard[state.discard.length - 1]!;
}

function isLegalPlay(card: Card, activeSuit: Suit, top: Card): boolean {
  if (card.rank === '8') return true;
  if (card.suit === activeSuit) return true;
  if (card.rank === top.rank) return true;
  return false;
}

function hasPlayable(hand: Card[], activeSuit: Suit, top: Card): boolean {
  return hand.some((c) => isLegalPlay(c, activeSuit, top));
}

function advanceTurn(state: GameState, steps: number): GameState {
  const n = state.players.length;
  let next = state.currentPlayerIndex;
  for (let i = 0; i < steps; i++) {
    next = (next + state.direction + n) % n;
  }
  return { ...state, currentPlayerIndex: next };
}

/**
 * Reshuffle the discard (all but the current top) back into the stock.
 * Leaves the top card and activeSuit untouched. Returns state unchanged
 * if there aren't enough cards under the top to form a new stock.
 */
function reshuffleDiscardIntoStock(state: GameState): GameState {
  if (state.discard.length <= 1) return state;
  const top = state.discard[state.discard.length - 1]!;
  const under = state.discard.slice(0, -1);
  const rng = mulberry32(
    deriveSeed(state.seed, 3, state.roundNumber, state.turnNumber),
  );
  const shuffled = [...under];
  shuffleInPlace(shuffled, rng);
  return {
    ...state,
    stock: [...state.stock, ...shuffled],
    discard: [top],
    history: [...state.history, { kind: 'reshuffle' }],
  };
}

/**
 * Draw one card from the stock, reshuffling the discard if stock is
 * empty. Returns { newState, drawn } — drawn is null iff both stock and
 * reshuffleable discard are exhausted.
 */
function drawOneCard(
  state: GameState,
  toPlayerId: string,
): { state: GameState; drawn: Card | null } {
  let s = state;
  if (s.stock.length === 0) {
    s = reshuffleDiscardIntoStock(s);
  }
  if (s.stock.length === 0) return { state: s, drawn: null };
  const [top, ...rest] = s.stock;
  const drawn = top!;
  const players = s.players.map((p) =>
    p.id === toPlayerId ? { ...p, hand: [...p.hand, drawn] } : p,
  );
  return { state: { ...s, stock: rest, players }, drawn };
}

function drawUntilPlayable(
  state: GameState,
  action: Extract<Action, { kind: 'draw' }>,
): GameState {
  let s: GameState = {
    ...state,
    history: [...state.history, action],
  };
  const pid = action.playerId;
  // Safety cap — the full deck plus hands plus discard is <= 104, so
  // 200 iterations is a massive overshoot guard.
  for (let i = 0; i < 200; i++) {
    const { state: s1, drawn } = drawOneCard(s, pid);
    s = s1;
    if (!drawn) break; // Exhausted; fall through to pass.
    const top = discardTop(s);
    if (isLegalPlay(drawn, s.activeSuit, top)) {
      // Force the drawn card to be played.
      return applyPlay(
        { ...s, phase: 'awaitingPlay' },
        { kind: 'play', playerId: pid, cardId: drawn.id },
      );
    }
  }
  // No playable card available — this counts as a pass.
  return applyPass(s, { kind: 'pass', playerId: pid });
}

function drawFixed(
  state: GameState,
  action: Extract<Action, { kind: 'draw' }>,
  count: number,
): GameState {
  let s: GameState = {
    ...state,
    history: [...state.history, action],
  };
  const pid = action.playerId;
  let drewAnything = false;
  for (let i = 0; i < count; i++) {
    const { state: s1, drawn } = drawOneCard(s, pid);
    s = s1;
    if (!drawn) break;
    drewAnything = true;
    const top = discardTop(s);
    if (isLegalPlay(drawn, s.activeSuit, top)) {
      // Stop drawing — player may play it or pass (under drawOne /
      // drawThree the play is optional). We mirror the spec's 'pass'
      // semantics: we leave it up to the player. To keep the engine
      // deterministic-for-tests we record the draw and end the turn;
      // the next legal action is a fresh play on the new turn.
      break;
    }
  }
  if (!drewAnything) {
    return applyPass(s, { kind: 'pass', playerId: pid });
  }
  return advanceTurn(s, 1);
}

function absorbPenalty(
  state: GameState,
  action: Extract<Action, { kind: 'draw' }>,
): GameState {
  const pid = action.playerId;
  let s: GameState = {
    ...state,
    history: [...state.history, action],
  };
  for (let i = 0; i < state.pendingDrawPenalty; i++) {
    const { state: s1, drawn } = drawOneCard(s, pid);
    s = s1;
    if (!drawn) break; // Stock + discard exhausted — stop short.
  }
  s = { ...s, pendingDrawPenalty: 0 };
  return advanceTurn(s, 1);
}

// ─── Round / game lifecycle ─────────────────────────────────────────

function finishRound(state: GameState, winnerId: string): GameState {
  // Score opponents' hands.
  const penalties: Record<string, number> = {};
  let total = 0;
  for (const p of state.players) {
    if (p.id === winnerId) {
      penalties[p.id] = 0;
      continue;
    }
    const pts = p.hand.reduce((n, c) => n + RANK_POINTS[c.rank], 0);
    penalties[p.id] = pts;
    total += pts;
  }

  const newPlayers = state.players.map((p) => {
    if (state.config.scoringMode === 'winnerTakesPoints') {
      if (p.id === winnerId) {
        return { ...p, scoreTotal: p.scoreTotal + total };
      }
      return p;
    }
    // penaltyAccumulation
    return { ...p, scoreTotal: p.scoreTotal + (penalties[p.id] ?? 0) };
  });

  const finished: GameState = {
    ...state,
    players: newPlayers,
    phase: 'roundOver',
    roundWinnerId: winnerId,
  };
  return checkGameEnd(finished);
}

function finishRoundBlocked(state: GameState): GameState {
  const penalties: Record<string, number> = {};
  for (const p of state.players) {
    penalties[p.id] = p.hand.reduce((n, c) => n + RANK_POINTS[c.rank], 0);
  }
  let winnerId: string | null = null;
  const newPlayers = state.players.map((p) => {
    if (state.config.blockedRoundRule === 'awardLowest') {
      // Nothing added to anyone; the round winner is the one with the
      // lowest penalty (ties broken by seat order).
      return p;
    }
    // penaltiesToEveryone
    if (state.config.scoringMode === 'winnerTakesPoints') {
      // No winner to receive points; everyone still gets their own
      // penalty added. Treat blocked-round like penaltyAccumulation
      // for scoring purposes in winnerTakesPoints mode.
      return { ...p, scoreTotal: p.scoreTotal + (penalties[p.id] ?? 0) };
    }
    return { ...p, scoreTotal: p.scoreTotal + (penalties[p.id] ?? 0) };
  });

  if (state.config.blockedRoundRule === 'awardLowest') {
    let lowest = Number.POSITIVE_INFINITY;
    for (const p of state.players) {
      if ((penalties[p.id] ?? 0) < lowest) {
        lowest = penalties[p.id] ?? 0;
        winnerId = p.id;
      }
    }
  }

  const finished: GameState = {
    ...state,
    players: newPlayers,
    phase: 'roundOver',
    roundWinnerId: winnerId,
    blocked: true,
  };
  return checkGameEnd(finished);
}

function checkGameEnd(state: GameState): GameState {
  const target = state.config.targetScore;
  if (state.config.scoringMode === 'penaltyAccumulation') {
    // Game ends when anyone crosses the target. Winner = player with
    // fewest points.
    const crossed = state.players.some((p) => p.scoreTotal >= target);
    if (!crossed) return state;
    const sorted = [...state.players].sort(
      (a, b) => a.scoreTotal - b.scoreTotal,
    );
    return { ...state, phase: 'gameOver', gameWinnerId: sorted[0]!.id };
  }
  // winnerTakesPoints — game ends when anyone reaches the target. Winner
  // is the first such player (highest score at that moment).
  const reached = state.players.find((p) => p.scoreTotal >= target);
  if (!reached) return state;
  // Pick the top score, tie-broken by seat order.
  const sorted = [...state.players].sort(
    (a, b) => b.scoreTotal - a.scoreTotal,
  );
  return { ...state, phase: 'gameOver', gameWinnerId: sorted[0]!.id };
}

// ─── Round restart (adapter-facing helper) ──────────────────────────

/**
 * Start a fresh round within the same game, preserving cumulative
 * scores. Shuffles a fresh deck, deals, flips starter. Called by the
 * adapter when the previous round ends and the game isn't over.
 */
export function startNextRound(state: GameState): GameState {
  if (state.phase !== 'roundOver') {
    throw new Error(`Cannot start next round from phase ${state.phase}`);
  }
  const nextRoundNumber = state.roundNumber + 1;
  const playerIds = state.players.map((p) => p.id);
  const fresh = newGame(playerIds, state.config, deriveSeed(state.seed, nextRoundNumber));
  // Preserve cumulative scores.
  const players = fresh.players.map((p, i) => ({
    ...p,
    scoreTotal: state.players[i]!.scoreTotal,
  }));
  return { ...fresh, players, roundNumber: nextRoundNumber };
}
