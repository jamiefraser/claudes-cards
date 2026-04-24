/**
 * Gin Rummy — pure game-logic module.
 *
 * Strictly 2-player. Deterministic via seeded PRNG. Implements the full
 * rule set specified in ./README.md, including:
 *   - First-turn offer (non-dealer then dealer on the opening upcard).
 *   - Draw / knock / gin / big-gin / discard phase machine.
 *   - Interactive layoff phase — the opponent lays cards off one at a
 *     time onto the knocker's melds, then `doneLayingOff` finalises.
 *   - Configurable bonuses (undercut / gin / big-gin / game / box /
 *     shutout) and target score.
 *   - Stock exhaustion threshold with "wash" (no-score draw) outcome.
 *   - Ace is ALWAYS low. A-2-3 is a legal run; Q-K-A is NOT.
 *   - Player submits their preferred `MeldingPartition` on knock/gin;
 *     engine validates. `computeOptimalMeldingPartition` is exposed so
 *     UIs / bots can hint the minimum-deadwood grouping.
 *
 * Public API:
 *   - newGame(playerIds, config, seed): GameState
 *   - legalActions(state, playerId): Action[]
 *   - applyAction(state, action): GameState
 *   - getPublicView(state, viewerId): PublicGameState
 *   - computeOptimalMeldingPartition(hand): MeldingPartition
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
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7'
  | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export interface Meld {
  /** Stable id the layoff phase uses to target a specific meld. */
  id: string;
  kind: 'set' | 'run';
  cards: Card[];
}

export interface MeldingPartition {
  melds: Array<{ kind: 'set' | 'run'; cards: Card[] }>;
  deadwood: Card[];
}

export interface PlayerState {
  id: string;
  hand: Card[];
  scoreTotal: number;
  roundsWon: number;
}

export type Phase =
  | 'firstTurnOffer'
  | 'firstTurnOfferDealer'
  | 'awaitingDraw'
  | 'awaitingKnockOrDiscard'
  | 'awaitingLayoff'
  | 'roundOver'
  | 'gameOver';

export type Action =
  | { kind: 'takeInitialDiscard'; playerId: string }
  | { kind: 'passInitialDiscard'; playerId: string }
  | { kind: 'drawStock'; playerId: string }
  | { kind: 'drawDiscard'; playerId: string }
  | {
      kind: 'knock';
      playerId: string;
      meldingPartition: MeldingPartition;
      discardCardId: string;
    }
  | {
      kind: 'gin';
      playerId: string;
      meldingPartition: MeldingPartition;
      discardCardId: string;
    }
  | {
      kind: 'bigGin';
      playerId: string;
      meldingPartition: MeldingPartition;
    }
  | { kind: 'discard'; playerId: string; cardId: string }
  | {
      kind: 'layoffCard';
      playerId: string;
      cardId: string;
      targetMeldId: string;
    }
  | { kind: 'doneLayingOff'; playerId: string };

export interface GinRummyConfig {
  targetScore: number;
  undercutBonus: number;
  ginBonus: number;
  bigGinBonus: number;
  gameBonus: number;
  boxBonus: number;
  shutoutDoublesGameBonus: boolean;
  allowBigGin: boolean;
  /** Number of stock cards at which the round is declared a draw. */
  stockExhaustThreshold: number;
  /** Seat 0 is dealer by default; toggle to put the non-dealer first. */
  dealerIndex: 0 | 1;
}

/** Results of a completed round — exposed for tests and UI. */
export interface RoundResult {
  winnerId: string | null; // null on wash/stock exhaustion
  /** 'knock' | 'gin' | 'bigGin' | 'undercut' | 'wash'. */
  ending: 'knock' | 'gin' | 'bigGin' | 'undercut' | 'wash';
  /** Points scored this round by the winner (0 on wash). */
  pointsAwarded: number;
  knockerId: string | null;
  knockerDeadwood: number;
  opponentDeadwood: number;
  /** Knocker's melds as laid down, including the final id per meld. */
  knockerMelds: Meld[];
  /** Opponent's laid-off cards (only when non-gin knock). */
  laidOffCards: Card[];
  /** Opponent's remaining hand partition after layoffs. */
  opponentPartition: MeldingPartition | null;
}

export interface GameState {
  players: [PlayerState, PlayerState];
  stock: Card[];
  discard: Card[];
  currentPlayerIndex: 0 | 1;
  phase: Phase;
  nonDealerId: string;
  dealerId: string;
  lastAction: Action | null;
  /**
   * When the current player drew from the discard this turn, this holds
   * that card's id so we can reject "take the same card you just drew
   * and immediately discard it" (spec §5).
   */
  discardDrawnThisTurn: string | null;
  /** Set when phase transitions to 'awaitingLayoff'. */
  awaitingLayoff: {
    knockerId: string;
    knockerMelds: Meld[];
    knockerDeadwood: number;
    laidOffCards: Card[];
  } | null;
  roundNumber: number;
  history: Action[];
  roundResult: RoundResult | null;
  gameWinnerId: string | null;
  seed: number;
  config: GinRummyConfig;
}

export interface PublicPlayerState {
  id: string;
  handCount: number;
  scoreTotal: number;
  roundsWon: number;
}

export interface PublicGameState {
  players: PublicPlayerState[];
  viewerHand: Card[];
  stockCount: number;
  discard: Card[];
  currentPlayerId: string | null;
  phase: Phase;
  nonDealerId: string;
  dealerId: string;
  roundNumber: number;
  history: Action[];
  awaitingLayoff: GameState['awaitingLayoff'];
  roundResult: RoundResult | null;
  gameWinnerId: string | null;
}

// ─── Defaults ───────────────────────────────────────────────────────

export const DEFAULT_CONFIG: GinRummyConfig = {
  targetScore: 100,
  undercutBonus: 25,
  ginBonus: 20,
  bigGinBonus: 31,
  gameBonus: 100,
  boxBonus: 20,
  shutoutDoublesGameBonus: true,
  allowBigGin: true,
  stockExhaustThreshold: 2,
  dealerIndex: 0,
};

// ─── Constants ──────────────────────────────────────────────────────

const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: readonly Rank[] = [
  'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K',
];

/** Ordinal rank value for run ordering (ace LOW = 1). */
const RANK_ORD: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

/** Deadwood point value. */
const RANK_POINTS: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 10, Q: 10, K: 10,
};

function cardPoints(c: Card): number {
  return RANK_POINTS[c.rank];
}

function deadwoodOf(cards: Card[]): number {
  return cards.reduce((n, c) => n + cardPoints(c), 0);
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
  config: GinRummyConfig,
  seed: number,
): GameState {
  if (playerIds.length !== 2) throw new Error('Gin Rummy requires exactly 2 players');
  const dealerIdx = config.dealerIndex;
  const dealerId = playerIds[dealerIdx]!;
  const nonDealerId = playerIds[dealerIdx === 0 ? 1 : 0]!;

  const rng = mulberry32(deriveSeed(seed, 0));
  const deck = buildDeck();
  shuffleInPlace(deck, rng);

  // Deal 10 cards each, round-robin starting with the non-dealer so
  // they receive the first card dealt.
  const hands: Card[][] = [[], []];
  let seatCursor = dealerIdx === 0 ? 1 : 0;
  for (let i = 0; i < 20; i++) {
    hands[seatCursor]!.push(deck.shift()!);
    seatCursor = seatCursor === 0 ? 1 : 0;
  }

  const discardTop = deck.shift()!;
  const stock = deck;
  const cleanHands = hands;

  const players: [PlayerState, PlayerState] = [
    {
      id: playerIds[0]!,
      hand: cleanHands[0]!,
      scoreTotal: 0,
      roundsWon: 0,
    },
    {
      id: playerIds[1]!,
      hand: cleanHands[1]!,
      scoreTotal: 0,
      roundsWon: 0,
    },
  ];

  return {
    players,
    stock,
    discard: [discardTop],
    currentPlayerIndex: (dealerIdx === 0 ? 1 : 0) as 0 | 1, // non-dealer decides first
    phase: 'firstTurnOffer',
    nonDealerId,
    dealerId,
    lastAction: null,
    discardDrawnThisTurn: null,
    awaitingLayoff: null,
    roundNumber: 1,
    history: [],
    roundResult: null,
    gameWinnerId: null,
    seed,
    config,
  };
}

export function legalActions(state: GameState, playerId: string): Action[] {
  if (state.phase === 'roundOver' || state.phase === 'gameOver') return [];

  const currentPlayer = state.players[state.currentPlayerIndex];

  if (state.phase === 'awaitingLayoff') {
    // Only the non-knocker may lay off.
    const nonKnocker = state.players.find((p) => p.id !== state.awaitingLayoff!.knockerId)!;
    if (playerId !== nonKnocker.id) return [];
    const actions: Action[] = [{ kind: 'doneLayingOff', playerId }];
    for (const card of nonKnocker.hand) {
      for (const m of state.awaitingLayoff!.knockerMelds) {
        if (canLayoffOnto(card, m)) {
          actions.push({ kind: 'layoffCard', playerId, cardId: card.id, targetMeldId: m.id });
        }
      }
    }
    return actions;
  }

  if (playerId !== currentPlayer.id) return [];

  const actions: Action[] = [];
  switch (state.phase) {
    case 'firstTurnOffer':
    case 'firstTurnOfferDealer':
      actions.push({ kind: 'takeInitialDiscard', playerId });
      actions.push({ kind: 'passInitialDiscard', playerId });
      break;
    case 'awaitingDraw':
      if (state.stock.length > 0) actions.push({ kind: 'drawStock', playerId });
      if (state.discard.length > 0) actions.push({ kind: 'drawDiscard', playerId });
      break;
    case 'awaitingKnockOrDiscard': {
      // Player currently holds 11 cards. Discard any, or knock/gin/big-gin.
      // Cannot discard the card drawn this turn from the discard pile.
      const forbidden = state.discardDrawnThisTurn;
      for (const c of currentPlayer.hand) {
        if (forbidden && c.id === forbidden) continue;
        actions.push({ kind: 'discard', playerId, cardId: c.id });
      }
      // `knock` / `gin` / `bigGin` requires a submitted partition — the
      // engine doesn't enumerate every possible partition here. Tests
      // and bots compute their preferred partition and submit it; the
      // legal-actions list simply asserts discard is legal, which it
      // always is in this phase.
      break;
    }
    default:
      break;
  }
  return actions;
}

export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase === 'roundOver' || state.phase === 'gameOver') {
    throw new Error(`Cannot apply action in phase ${state.phase}`);
  }
  switch (action.kind) {
    case 'takeInitialDiscard': return applyTakeInitialDiscard(state, action);
    case 'passInitialDiscard': return applyPassInitialDiscard(state, action);
    case 'drawStock': return applyDrawStock(state, action);
    case 'drawDiscard': return applyDrawDiscard(state, action);
    case 'discard': return applyDiscard(state, action);
    case 'knock': return applyKnock(state, action);
    case 'gin': return applyGin(state, action);
    case 'bigGin': return applyBigGin(state, action);
    case 'layoffCard': return applyLayoffCard(state, action);
    case 'doneLayingOff': return applyDoneLayingOff(state, action);
  }
}

export function getPublicView(state: GameState, viewerId: string): PublicGameState {
  const viewer = state.players.find((p) => p.id === viewerId);
  const currentPlayer = state.players[state.currentPlayerIndex];
  return {
    players: state.players.map((p) => ({
      id: p.id,
      handCount: p.hand.length,
      scoreTotal: p.scoreTotal,
      roundsWon: p.roundsWon,
    })),
    viewerHand: viewer ? [...viewer.hand] : [],
    stockCount: state.stock.length,
    discard: [...state.discard],
    currentPlayerId:
      state.phase === 'roundOver' || state.phase === 'gameOver'
        ? null
        : currentPlayer.id,
    phase: state.phase,
    nonDealerId: state.nonDealerId,
    dealerId: state.dealerId,
    roundNumber: state.roundNumber,
    history: [...state.history],
    awaitingLayoff: state.awaitingLayoff,
    roundResult: state.roundResult,
    gameWinnerId: state.gameWinnerId,
  };
}

// ─── Action handlers ────────────────────────────────────────────────

function applyTakeInitialDiscard(
  state: GameState,
  action: Extract<Action, { kind: 'takeInitialDiscard' }>,
): GameState {
  requirePhase(state, ['firstTurnOffer', 'firstTurnOfferDealer']);
  const current = state.players[state.currentPlayerIndex];
  requireCurrent(action.playerId, current.id);

  const upcard = state.discard[state.discard.length - 1]!;
  const newHand = [...current.hand, upcard];
  const newDiscard = state.discard.slice(0, -1);
  const newPlayers = updatePlayer(state, current.id, { hand: newHand });

  // After taking, the SAME player continues into the draw-then-discard
  // cycle — they now have 11 cards so they must discard.
  return {
    ...state,
    players: newPlayers,
    discard: newDiscard,
    phase: 'awaitingKnockOrDiscard',
    discardDrawnThisTurn: upcard.id,
    lastAction: action,
    history: [...state.history, action],
  };
}

function applyPassInitialDiscard(
  state: GameState,
  action: Extract<Action, { kind: 'passInitialDiscard' }>,
): GameState {
  requirePhase(state, ['firstTurnOffer', 'firstTurnOfferDealer']);
  const current = state.players[state.currentPlayerIndex];
  requireCurrent(action.playerId, current.id);

  if (state.phase === 'firstTurnOffer') {
    // Non-dealer passed — offer to dealer.
    const dealerIdx = state.players.findIndex((p) => p.id === state.dealerId) as 0 | 1;
    return {
      ...state,
      currentPlayerIndex: dealerIdx,
      phase: 'firstTurnOfferDealer',
      lastAction: action,
      history: [...state.history, action],
    };
  }
  // Dealer passed — non-dealer starts a normal turn.
  const nonDealerIdx = state.players.findIndex((p) => p.id === state.nonDealerId) as 0 | 1;
  return {
    ...state,
    currentPlayerIndex: nonDealerIdx,
    phase: 'awaitingDraw',
    lastAction: action,
    history: [...state.history, action],
  };
}

function applyDrawStock(
  state: GameState,
  action: Extract<Action, { kind: 'drawStock' }>,
): GameState {
  requirePhase(state, ['awaitingDraw']);
  const current = state.players[state.currentPlayerIndex];
  requireCurrent(action.playerId, current.id);
  if (state.stock.length === 0) throw new Error('Stock is empty');

  const [top, ...rest] = state.stock;
  const newHand = [...current.hand, top!];
  const newPlayers = updatePlayer(state, current.id, { hand: newHand });
  return {
    ...state,
    players: newPlayers,
    stock: rest,
    phase: 'awaitingKnockOrDiscard',
    discardDrawnThisTurn: null,
    lastAction: action,
    history: [...state.history, action],
  };
}

function applyDrawDiscard(
  state: GameState,
  action: Extract<Action, { kind: 'drawDiscard' }>,
): GameState {
  requirePhase(state, ['awaitingDraw']);
  const current = state.players[state.currentPlayerIndex];
  requireCurrent(action.playerId, current.id);
  if (state.discard.length === 0) throw new Error('Discard pile is empty');

  const top = state.discard[state.discard.length - 1]!;
  const newDiscard = state.discard.slice(0, -1);
  const newHand = [...current.hand, top];
  const newPlayers = updatePlayer(state, current.id, { hand: newHand });
  return {
    ...state,
    players: newPlayers,
    discard: newDiscard,
    phase: 'awaitingKnockOrDiscard',
    discardDrawnThisTurn: top.id,
    lastAction: action,
    history: [...state.history, action],
  };
}

function applyDiscard(
  state: GameState,
  action: Extract<Action, { kind: 'discard' }>,
): GameState {
  requirePhase(state, ['awaitingKnockOrDiscard']);
  const current = state.players[state.currentPlayerIndex];
  requireCurrent(action.playerId, current.id);
  if (state.discardDrawnThisTurn && state.discardDrawnThisTurn === action.cardId) {
    throw new Error('Cannot discard the card you just took from the discard');
  }
  const card = current.hand.find((c) => c.id === action.cardId);
  if (!card) throw new Error(`Card ${action.cardId} not in hand`);

  const newHand = current.hand.filter((c) => c.id !== action.cardId);
  const newPlayers = updatePlayer(state, current.id, { hand: newHand });
  const newDiscard = [...state.discard, card];

  // Pass the turn.
  const nextIdx: 0 | 1 = state.currentPlayerIndex === 0 ? 1 : 0;
  let next: GameState = {
    ...state,
    players: newPlayers,
    discard: newDiscard,
    phase: 'awaitingDraw',
    currentPlayerIndex: nextIdx,
    discardDrawnThisTurn: null,
    lastAction: action,
    history: [...state.history, action],
  };

  // Stock-exhaustion check — if the stock is at or below the threshold
  // after the just-completed discard, the round is a wash.
  if (next.stock.length <= state.config.stockExhaustThreshold) {
    next = finishWash(next);
  }
  return next;
}

function applyKnock(
  state: GameState,
  action: Extract<Action, { kind: 'knock' }>,
): GameState {
  requirePhase(state, ['awaitingKnockOrDiscard']);
  const current = state.players[state.currentPlayerIndex];
  requireCurrent(action.playerId, current.id);

  const discardCard = current.hand.find((c) => c.id === action.discardCardId);
  if (!discardCard) throw new Error('Knock discard not in hand');
  if (state.discardDrawnThisTurn === action.discardCardId) {
    throw new Error('Cannot discard the card just drawn from the discard');
  }

  const handAfter = current.hand.filter((c) => c.id !== action.discardCardId);
  validatePartitionCovers(action.meldingPartition, handAfter);
  for (const m of action.meldingPartition.melds) validateMeld(m.kind, m.cards);

  const deadwood = deadwoodOf(action.meldingPartition.deadwood);
  if (deadwood === 0) {
    throw new Error('Hand has zero deadwood — use `gin` instead of `knock`');
  }
  if (deadwood > 10) {
    throw new Error(`Knock requires deadwood ≤ 10; got ${deadwood}`);
  }

  const newHandPlayer = updatePlayer(state, current.id, { hand: handAfter });
  const newDiscard = [...state.discard, discardCard];

  // Enter layoff phase — opponent lays off onto knocker's melds.
  const knockerMelds: Meld[] = action.meldingPartition.melds.map((m, i) => ({
    id: `m${i}`,
    kind: m.kind,
    cards: [...m.cards],
  }));

  return {
    ...state,
    players: newHandPlayer,
    discard: newDiscard,
    discardDrawnThisTurn: null,
    phase: 'awaitingLayoff',
    awaitingLayoff: {
      knockerId: current.id,
      knockerMelds,
      knockerDeadwood: deadwood,
      laidOffCards: [],
    },
    lastAction: action,
    history: [...state.history, action],
  };
}

function applyGin(
  state: GameState,
  action: Extract<Action, { kind: 'gin' }>,
): GameState {
  requirePhase(state, ['awaitingKnockOrDiscard']);
  const current = state.players[state.currentPlayerIndex];
  requireCurrent(action.playerId, current.id);

  const discardCard = current.hand.find((c) => c.id === action.discardCardId);
  if (!discardCard) throw new Error('Gin discard not in hand');
  if (state.discardDrawnThisTurn === action.discardCardId) {
    throw new Error('Cannot discard the card just drawn from the discard');
  }
  const handAfter = current.hand.filter((c) => c.id !== action.discardCardId);
  validatePartitionCovers(action.meldingPartition, handAfter);
  for (const m of action.meldingPartition.melds) validateMeld(m.kind, m.cards);
  if (action.meldingPartition.deadwood.length !== 0) {
    throw new Error('Gin requires all cards to be in melds (no deadwood)');
  }

  const newHandPlayer = updatePlayer(state, current.id, { hand: handAfter });
  const newDiscard = [...state.discard, discardCard];

  const knockerMelds: Meld[] = action.meldingPartition.melds.map((m, i) => ({
    id: `m${i}`,
    kind: m.kind,
    cards: [...m.cards],
  }));

  // No layoff on gin — finalise immediately.
  const afterState: GameState = {
    ...state,
    players: newHandPlayer,
    discard: newDiscard,
    discardDrawnThisTurn: null,
    phase: 'roundOver',
    lastAction: action,
    history: [...state.history, action],
  };
  return finalizeRound(afterState, {
    knockerId: current.id,
    knockerMelds,
    knockerDeadwood: 0,
    ending: 'gin',
    laidOffCards: [],
    opponentPartition: null,
  });
}

function applyBigGin(
  state: GameState,
  action: Extract<Action, { kind: 'bigGin' }>,
): GameState {
  requirePhase(state, ['awaitingKnockOrDiscard']);
  if (!state.config.allowBigGin) throw new Error('Big gin is disabled in this game');
  const current = state.players[state.currentPlayerIndex];
  requireCurrent(action.playerId, current.id);

  // Big gin uses all 11 cards without discarding.
  validatePartitionCovers(action.meldingPartition, current.hand);
  for (const m of action.meldingPartition.melds) validateMeld(m.kind, m.cards);
  if (action.meldingPartition.deadwood.length !== 0) {
    throw new Error('Big gin requires all 11 cards in melds');
  }
  if (current.hand.length !== 11) {
    throw new Error('Big gin requires 11 cards (player must just have drawn)');
  }

  const knockerMelds: Meld[] = action.meldingPartition.melds.map((m, i) => ({
    id: `m${i}`,
    kind: m.kind,
    cards: [...m.cards],
  }));

  const afterState: GameState = {
    ...state,
    phase: 'roundOver',
    lastAction: action,
    history: [...state.history, action],
  };
  return finalizeRound(afterState, {
    knockerId: current.id,
    knockerMelds,
    knockerDeadwood: 0,
    ending: 'bigGin',
    laidOffCards: [],
    opponentPartition: null,
  });
}

function applyLayoffCard(
  state: GameState,
  action: Extract<Action, { kind: 'layoffCard' }>,
): GameState {
  requirePhase(state, ['awaitingLayoff']);
  const layoff = state.awaitingLayoff!;
  const defender = state.players.find((p) => p.id !== layoff.knockerId)!;
  if (action.playerId !== defender.id) {
    throw new Error(`Only ${defender.id} may lay off`);
  }
  const card = defender.hand.find((c) => c.id === action.cardId);
  if (!card) throw new Error('Layoff card not in hand');
  const target = layoff.knockerMelds.find((m) => m.id === action.targetMeldId);
  if (!target) throw new Error('Target meld not found');
  if (!canLayoffOnto(card, target)) throw new Error('Card does not legally extend that meld');

  const updatedMelds = layoff.knockerMelds.map((m) =>
    m.id === target.id ? { ...m, cards: extendMeld(m, card) } : m,
  );
  const newDefenderHand = defender.hand.filter((c) => c.id !== card.id);
  const newPlayers = updatePlayer(state, defender.id, { hand: newDefenderHand });
  return {
    ...state,
    players: newPlayers,
    awaitingLayoff: {
      ...layoff,
      knockerMelds: updatedMelds,
      laidOffCards: [...layoff.laidOffCards, card],
    },
    lastAction: action,
    history: [...state.history, action],
  };
}

function applyDoneLayingOff(
  state: GameState,
  action: Extract<Action, { kind: 'doneLayingOff' }>,
): GameState {
  requirePhase(state, ['awaitingLayoff']);
  const layoff = state.awaitingLayoff!;
  const defender = state.players.find((p) => p.id !== layoff.knockerId)!;
  if (action.playerId !== defender.id) {
    throw new Error(`Only ${defender.id} may finish layoff`);
  }

  // Compute defender's remaining deadwood using their optimal partition.
  const defenderPartition = computeOptimalMeldingPartition(defender.hand);
  const defenderDeadwood = deadwoodOf(defenderPartition.deadwood);

  const knockerDeadwood = layoff.knockerDeadwood;
  const isUndercut = defenderDeadwood <= knockerDeadwood;

  const ended: GameState = {
    ...state,
    phase: 'roundOver',
    lastAction: action,
    history: [...state.history, action],
  };
  return finalizeRound(ended, {
    knockerId: layoff.knockerId,
    knockerMelds: layoff.knockerMelds,
    knockerDeadwood,
    ending: isUndercut ? 'undercut' : 'knock',
    laidOffCards: layoff.laidOffCards,
    opponentPartition: defenderPartition,
    opponentDeadwood: defenderDeadwood,
  });
}

// ─── Meld validation / layoff helpers ───────────────────────────────

function validateMeld(kind: 'set' | 'run', cards: Card[]): void {
  if (cards.length < 3) throw new Error(`Meld too short: ${cards.length}`);
  if (kind === 'set') {
    if (cards.length > 4) throw new Error('Set has too many cards (max 4)');
    const rank = cards[0]!.rank;
    for (const c of cards) if (c.rank !== rank) throw new Error('Set has mixed ranks');
    const suits = new Set(cards.map((c) => c.suit));
    if (suits.size !== cards.length) throw new Error('Set has duplicate suits');
    return;
  }
  // Run
  const suit = cards[0]!.suit;
  for (const c of cards) if (c.suit !== suit) throw new Error('Run has mixed suits');
  const sorted = [...cards].sort((a, b) => RANK_ORD[a.rank] - RANK_ORD[b.rank]);
  // Ace-low only: no wrap K-A allowed.
  for (let i = 1; i < sorted.length; i++) {
    if (RANK_ORD[sorted[i]!.rank] !== RANK_ORD[sorted[i - 1]!.rank] + 1) {
      throw new Error('Run is not consecutive ace-low');
    }
  }
}

function validatePartitionCovers(partition: MeldingPartition, hand: Card[]): void {
  const covered = new Set<string>();
  for (const m of partition.melds) {
    for (const c of m.cards) {
      if (covered.has(c.id)) throw new Error(`Card ${c.id} appears in multiple melds`);
      covered.add(c.id);
    }
  }
  for (const c of partition.deadwood) {
    if (covered.has(c.id)) throw new Error(`Card ${c.id} in both meld and deadwood`);
    covered.add(c.id);
  }
  if (covered.size !== hand.length) {
    throw new Error(`Partition covers ${covered.size} cards, hand has ${hand.length}`);
  }
  for (const c of hand) {
    if (!covered.has(c.id)) throw new Error(`Partition missing card ${c.id}`);
  }
}

function canLayoffOnto(card: Card, meld: Meld): boolean {
  if (meld.kind === 'set') {
    if (card.rank !== meld.cards[0]!.rank) return false;
    if (meld.cards.some((c) => c.suit === card.suit)) return false;
    if (meld.cards.length >= 4) return false;
    return true;
  }
  // Run — same suit, extends either end by 1 rank.
  if (card.suit !== meld.cards[0]!.suit) return false;
  const sorted = [...meld.cards].sort((a, b) => RANK_ORD[a.rank] - RANK_ORD[b.rank]);
  const low = RANK_ORD[sorted[0]!.rank];
  const high = RANK_ORD[sorted[sorted.length - 1]!.rank];
  const v = RANK_ORD[card.rank];
  // Ace-low only: can't extend K up to A.
  if (v === low - 1 && v >= 1) return true;
  if (v === high + 1 && v <= 13) return true;
  return false;
}

function extendMeld(meld: Meld, card: Card): Card[] {
  return [...meld.cards, card];
}

// ─── Optimal partition (DFS) ────────────────────────────────────────

interface RawMeld {
  kind: 'set' | 'run';
  cards: Card[];
}

function enumerateMelds(hand: Card[]): RawMeld[] {
  const out: RawMeld[] = [];

  // Sets by rank.
  const byRank = new Map<Rank, Card[]>();
  for (const c of hand) {
    const list = byRank.get(c.rank) ?? [];
    list.push(c);
    byRank.set(c.rank, list);
  }
  for (const cards of byRank.values()) {
    if (cards.length >= 3) {
      if (cards.length === 3) out.push({ kind: 'set', cards });
      else {
        // Length 4: the full set and every 3-subset so the DFS can
        // choose to leave one out if that helps runs.
        out.push({ kind: 'set', cards });
        for (let skip = 0; skip < 4; skip++) {
          out.push({ kind: 'set', cards: cards.filter((_, i) => i !== skip) });
        }
      }
    }
  }

  // Runs by suit — enumerate every 3+ consecutive window.
  const bySuit = new Map<Suit, Card[]>();
  for (const c of hand) {
    const list = bySuit.get(c.suit) ?? [];
    list.push(c);
    bySuit.set(c.suit, list);
  }
  for (const cards of bySuit.values()) {
    const sorted = [...cards].sort((a, b) => RANK_ORD[a.rank] - RANK_ORD[b.rank]);
    for (let start = 0; start < sorted.length - 2; start++) {
      for (let end = start + 2; end < sorted.length; end++) {
        let ok = true;
        for (let k = start + 1; k <= end; k++) {
          if (RANK_ORD[sorted[k]!.rank] !== RANK_ORD[sorted[k - 1]!.rank] + 1) {
            ok = false;
            break;
          }
        }
        if (ok) out.push({ kind: 'run', cards: sorted.slice(start, end + 1) });
      }
    }
  }
  return out;
}

export function computeOptimalMeldingPartition(hand: Card[]): MeldingPartition {
  const all = enumerateMelds(hand);
  let bestDw = deadwoodOf(hand);
  let bestMelds: RawMeld[] = [];
  let bestDead = [...hand];

  function recurse(used: Set<string>, chosen: RawMeld[], startIdx: number): void {
    const remaining = hand.filter((c) => !used.has(c.id));
    const dw = deadwoodOf(remaining);
    if (dw < bestDw) {
      bestDw = dw;
      bestMelds = [...chosen];
      bestDead = remaining;
    }
    if (bestDw === 0) return;
    for (let i = startIdx; i < all.length; i++) {
      const m = all[i]!;
      if (m.cards.some((c) => used.has(c.id))) continue;
      const newUsed = new Set(used);
      for (const c of m.cards) newUsed.add(c.id);
      chosen.push(m);
      recurse(newUsed, chosen, i + 1);
      chosen.pop();
    }
  }
  recurse(new Set(), [], 0);
  return {
    melds: bestMelds.map((m) => ({ kind: m.kind, cards: [...m.cards] })),
    deadwood: bestDead,
  };
}

// ─── Round finalisation / scoring ───────────────────────────────────

interface FinishArgs {
  knockerId: string;
  knockerMelds: Meld[];
  knockerDeadwood: number;
  ending: 'knock' | 'gin' | 'bigGin' | 'undercut';
  laidOffCards: Card[];
  opponentPartition: MeldingPartition | null;
  opponentDeadwood?: number;
}

function finishWash(state: GameState): GameState {
  const ended: GameState = {
    ...state,
    phase: 'roundOver',
  };
  return finalizeRound(ended, null);
}

function finalizeRound(state: GameState, args: FinishArgs | null): GameState {
  let result: RoundResult;
  let newPlayers: [PlayerState, PlayerState] = [...state.players];

  if (args === null) {
    // Wash / stock exhaustion.
    result = {
      winnerId: null,
      ending: 'wash',
      pointsAwarded: 0,
      knockerId: null,
      knockerDeadwood: 0,
      opponentDeadwood: 0,
      knockerMelds: [],
      laidOffCards: [],
      opponentPartition: null,
    };
  } else {
    const opponentDw = args.opponentDeadwood ?? (args.ending === 'knock' || args.ending === 'undercut'
      ? deadwoodOf(
          state.players.find((p) => p.id !== args.knockerId)!.hand,
        )
      : deadwoodOf(state.players.find((p) => p.id !== args.knockerId)!.hand));

    let winnerId: string;
    let pointsAwarded: number;

    if (args.ending === 'gin') {
      winnerId = args.knockerId;
      pointsAwarded = opponentDw + state.config.ginBonus;
    } else if (args.ending === 'bigGin') {
      winnerId = args.knockerId;
      pointsAwarded = opponentDw + state.config.bigGinBonus;
    } else if (args.ending === 'undercut') {
      winnerId = state.players.find((p) => p.id !== args.knockerId)!.id;
      pointsAwarded = (args.knockerDeadwood - opponentDw) + state.config.undercutBonus;
    } else {
      // Regular knock.
      winnerId = args.knockerId;
      pointsAwarded = opponentDw - args.knockerDeadwood;
    }

    newPlayers = state.players.map((p) =>
      p.id === winnerId
        ? { ...p, scoreTotal: p.scoreTotal + pointsAwarded, roundsWon: p.roundsWon + 1 }
        : p,
    ) as [PlayerState, PlayerState];

    result = {
      winnerId,
      ending: args.ending,
      pointsAwarded,
      knockerId: args.knockerId,
      knockerDeadwood: args.knockerDeadwood,
      opponentDeadwood: opponentDw,
      knockerMelds: args.knockerMelds,
      laidOffCards: args.laidOffCards,
      opponentPartition: args.opponentPartition,
    };
  }

  const nextState: GameState = {
    ...state,
    players: newPlayers,
    awaitingLayoff: null,
    roundResult: result,
  };
  return checkGameEnd(nextState);
}

function checkGameEnd(state: GameState): GameState {
  const crossed = state.players.find((p) => p.scoreTotal >= state.config.targetScore);
  if (!crossed) return state;

  // Apply game / box / shutout bonuses on top of cumulative round scores.
  const winnerId = crossed.id;
  const loser = state.players.find((p) => p.id !== winnerId)!;
  const shutout = loser.scoreTotal === 0;

  const gameBonus =
    state.config.gameBonus * (shutout && state.config.shutoutDoublesGameBonus ? 2 : 1);
  const finalPlayers = state.players.map((p) => {
    const boxes = p.roundsWon * state.config.boxBonus;
    const bonus = p.id === winnerId ? gameBonus : 0;
    return { ...p, scoreTotal: p.scoreTotal + boxes + bonus };
  }) as [PlayerState, PlayerState];

  return {
    ...state,
    players: finalPlayers,
    phase: 'gameOver',
    gameWinnerId: winnerId,
  };
}

/** Adapter-facing helper: start the next round within the same game. */
export function startNextRound(state: GameState): GameState {
  if (state.phase !== 'roundOver') {
    throw new Error(`Cannot start next round from phase ${state.phase}`);
  }
  const ids = state.players.map((p) => p.id);
  // Alternate the dealer each round so the first-turn offer flips.
  const nextDealerIdx = state.config.dealerIndex === 0 ? 1 : 0;
  const nextConfig: GinRummyConfig = { ...state.config, dealerIndex: nextDealerIdx };
  const fresh = newGame(ids, nextConfig, deriveSeed(state.seed, state.roundNumber + 1));
  const players: [PlayerState, PlayerState] = [
    { ...fresh.players[0], scoreTotal: state.players[0].scoreTotal, roundsWon: state.players[0].roundsWon },
    { ...fresh.players[1], scoreTotal: state.players[1].scoreTotal, roundsWon: state.players[1].roundsWon },
  ];
  return { ...fresh, players, roundNumber: state.roundNumber + 1 };
}

// ─── Misc ───────────────────────────────────────────────────────────

function requirePhase(state: GameState, allowed: Phase[]): void {
  if (!allowed.includes(state.phase)) {
    throw new Error(`Action not legal in phase ${state.phase}`);
  }
}

function requireCurrent(given: string, expected: string): void {
  if (given !== expected) throw new Error(`Not ${given}'s turn (${expected} is current)`);
}

function updatePlayer(
  state: GameState,
  id: string,
  patch: Partial<PlayerState>,
): [PlayerState, PlayerState] {
  return state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) as [PlayerState, PlayerState];
}
