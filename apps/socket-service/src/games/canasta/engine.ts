/**
 * Canasta Game Engine — Hoyle's Standard Games (Canasta chapter).
 *
 * Supports three variants:
 *   - 4 players in 2 partnerships (classic): deal 11, draw 1, 1 canasta to go out
 *   - 3 players individual:                   deal 13, draw 1, 1 canasta to go out
 *   - 2 players individual:                   deal 15, draw 2, 2 canastas to go out
 *
 * Deck:     2 standard decks + 4 Jokers = 108 cards.
 * Wild:     2s and Jokers (a meld must always contain more naturals than wilds,
 *           and no meld may contain more than 3 wilds).
 * Red 3s:   Bonus card. Each red 3 = 100; all four to one side = 800. A red 3
 *           drawn is placed face-up immediately and a replacement drawn.
 *           If a team has not melded at end of hand, red 3 bonus is deducted.
 * Melds:    3+ cards of the same rank (set). Runs are NOT legal in Canasta.
 *           Aces and 2s score 20, 8\u2013K score 10, 4\u20137 and black 3 score 5,
 *           Jokers score 50. A 7-card meld is a *canasta*: natural (no wild)
 *           canasta = 500 bonus, mixed canasta = 300 bonus. Black 3s can only
 *           be melded as an exit meld (no wilds, only when going out).
 *
 * Discard pile:
 *   - A discard pile is "frozen" for a side if:
 *       (a) it has not yet been unfrozen since being frozen by a red 3 (opening
 *           turn up-card was red 3), OR
 *       (b) a wild card was discarded onto it (permanent freeze for all).
 *     Additionally, the pile is effectively frozen for any side that has not
 *     yet made its initial meld.
 *   - To *take the pile* the player must be able to use the top card in a
 *     meld. When frozen, two *natural* cards of the top card\u2019s rank must come
 *     from the hand to form a new meld with the top card. When not frozen,
 *     one or more cards (wild or natural) may be used from the hand or an
 *     existing meld.
 *   - A pile whose top card is a black 3 or wild may NEVER be taken.
 *
 * Initial meld minimum: team/player score at start of hand determines the
 *   minimum meld-point total required for the first meld of the hand.
 *     below 0:       15
 *     0 \u2013 1,495:     50
 *     1,500 \u2013 2,995: 90
 *     3,000+:        120
 *   The natural card values in melds count toward the minimum. Red 3 bonuses,
 *   canasta bonuses and going-out bonuses do NOT.
 *
 * Going out:
 *   - Requires the specified number of canastas already on the table AND the
 *     last card is discarded to end the turn.
 *   - Concealed going-out (player had no prior melds; lays down everything
 *     including a canasta on a single turn) = 200 bonus, else 100.
 *
 * Win: first side to 5,000 at end of hand.
 */

import type {
  IGameEngine,
  GameConfig,
  GameState,
  PlayerAction,
  PlayerRanking,
  Card,
  Suit,
} from '@card-platform/shared-types';
import { createStandardDeck } from '@card-platform/cards-engine';
import { logger } from '../../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CanastaPhase = 'draw' | 'meld-discard' | 'ended';
export type CanastaVariant = '2p' | '3p' | '4p';

/** A single meld on the table. Naturals are stored first then wilds. */
export interface CanastaMeld {
  /** Rank the meld represents (e.g. '7', 'K', 'A'). Black-3 melds use '3'. */
  rank: string;
  cards: Card[];
  naturals: number;
  wilds: number;
  /** True once the meld has 7+ cards. */
  isCanasta: boolean;
  /** When isCanasta: 'natural' (no wilds) or 'mixed' (with wilds). */
  canastaType?: 'natural' | 'mixed';
  /** Black-3 exit meld \u2014 cannot contain wilds, only possible when going out. */
  blackThrees?: boolean;
}

export interface CanastaPublicData {
  gamePhase: CanastaPhase;
  variant: CanastaVariant;
  drawPile: Card[];
  drawPileSize: number;
  discardPile: Card[];
  discardTop: Card | null;
  /** Red 3 / wild discards permanently freeze the pile until it is taken. */
  discardFrozen: boolean;

  /**
   * Teams / individuals:
   *   - 4p partnerships: 'A' (seat 0/2) and 'B' (seat 1/3)
   *   - 2p/3p individual: playerId per player
   */
  meldKeys: string[];
  melds: Record<string, CanastaMeld[]>;
  redThrees: Record<string, Card[]>;
  initialMeldDone: Record<string, boolean>;
  /**
   * Snapshot of `initialMeldDone` captured at the start of the current player's
   * turn. Used to decide the concealed-going-out bonus \u2014 if a side had no
   * meld at the start of this turn and subsequently goes out, the 200-point
   * concealed bonus applies.
   */
  initialMeldDoneAtTurnStart: Record<string, boolean>;
  scores: Record<string, number>;
  /** Scores BEFORE this hand \u2014 used to compute initial-meld minimum. */
  scoresPriorHand: Record<string, number>;

  /** Number of canastas required to go out (1 for 3p/4p, 2 for 2p). */
  goOutRequirement: number;
  /** Number of stock cards drawn per turn (1 for 3p/4p, 2 for 2p). */
  drawCount: number;

  dealerIndex: number;

  /**
   * Last action audit trail \u2014 useful for UI hints. Human-readable, not
   * load-bearing for correctness.
   */
  log: string[];
}

const WILD_RANKS = new Set(['2']);

function isJoker(c: Card): boolean {
  // Jokers in the engine are represented with rank/suit both undefined.
  return !c.rank && !c.suit;
}

export function isWild(c: Card): boolean {
  return isJoker(c) || (c.rank !== undefined && WILD_RANKS.has(c.rank));
}

function isRedThree(c: Card): boolean {
  return c.rank === '3' && (c.suit === 'hearts' || c.suit === 'diamonds');
}

function isBlackThree(c: Card): boolean {
  return c.rank === '3' && (c.suit === 'clubs' || c.suit === 'spades');
}

/** Card-point value for melding & deadwood totals (Hoyle's). */
export function canastaCardPoints(card: Card): number {
  if (isJoker(card)) return 50;
  if (card.rank === '2') return 20;
  if (card.rank === 'A') return 20;
  if (card.rank === '3') {
    // Red 3 = 100 bonus (handled separately). Black 3 = 5.
    return card.suit === 'hearts' || card.suit === 'diamonds' ? 100 : 5;
  }
  if (['J', 'Q', 'K', '10', '9', '8'].includes(card.rank ?? '')) return 10;
  return 5; // 4\u20137
}

/** Hoyle's initial-meld minimum, driven by a side's pre-hand score. */
export function initialMeldMinimum(priorScore: number): number {
  if (priorScore < 0) return 15;
  if (priorScore < 1500) return 50;
  if (priorScore < 3000) return 90;
  return 120;
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function makeJoker(id: string): Card {
  return { id, deckType: 'standard', rank: undefined, suit: undefined, value: 50, faceUp: false };
}

function buildCanastaDeck(): Card[] {
  const deck1 = createStandardDeck().cards.map((c) => ({ ...c, id: `d1-${c.id}` }));
  const deck2 = createStandardDeck().cards.map((c) => ({ ...c, id: `d2-${c.id}` }));
  const jokers = [makeJoker('joker-1'), makeJoker('joker-2'), makeJoker('joker-3'), makeJoker('joker-4')];
  return [...deck1, ...deck2, ...jokers];
}

/** Key that identifies a player's "side" for melds, scoring etc. */
function sideOf(variant: CanastaVariant, playerIds: string[], playerId: string): string {
  if (variant === '4p') {
    const idx = playerIds.indexOf(playerId);
    return idx % 2 === 0 ? 'A' : 'B';
  }
  return playerId;
}

function otherSides(all: string[], side: string): string[] {
  return all.filter((s) => s !== side);
}

function variantFor(n: number): CanastaVariant {
  if (n === 2) return '2p';
  if (n === 3) return '3p';
  if (n === 4) return '4p';
  throw new Error(`Canasta requires 2\u20134 players (got ${n})`);
}

function dealSize(v: CanastaVariant): number {
  return v === '2p' ? 15 : v === '3p' ? 13 : 11;
}

function goOutReq(v: CanastaVariant): number {
  return v === '2p' ? 2 : 1;
}

function drawCount(v: CanastaVariant): number {
  return v === '2p' ? 2 : 1;
}

/**
 * Draw-and-promote helper. Used during initial deal and regular draws so red 3s
 * are auto-placed in front of the drawer's side and a replacement drawn.
 */
function drawOneAutoRed3(
  drawPile: Card[],
  redThrees: Record<string, Card[]>,
  side: string,
): { drawn: Card | null; drawPile: Card[]; redThrees: Record<string, Card[]> } {
  let pile = drawPile;
  let reds = redThrees;
  while (pile.length > 0) {
    const top = pile[pile.length - 1]!;
    pile = pile.slice(0, -1);
    if (isRedThree(top)) {
      reds = { ...reds, [side]: [...(reds[side] ?? []), { ...top, faceUp: true }] };
      continue;
    }
    return { drawn: top, drawPile: pile, redThrees: reds };
  }
  return { drawn: null, drawPile: pile, redThrees: reds };
}

// ---------------------------------------------------------------------------
// Pickup error codes — stable strings consumers (socket handler, UI toasts,
// bot strategy) can branch on. Kept as a string-literal union instead of a
// TS enum so they serialise cleanly over the wire and survive JSON
// round-trips without aliasing.
// ---------------------------------------------------------------------------

export type CanastaPickupErrorCode =
  | 'EMPTY_PILE'
  | 'BLOCKED_BLACK_THREE'
  | 'BLOCKED_WILD_ON_TOP'
  | 'BLOCKED_RED_THREE'
  | 'NO_MATCHING_CARD'
  | 'FROZEN_WILD_MATCH_FORBIDDEN'
  | 'FROZEN_EXTENSION_FORBIDDEN'
  | 'WILD_ONLY_MATCH_FORBIDDEN'
  | 'MELD_STRUCTURE_INVALID'
  | 'WOULD_CONVERT_NATURAL_CANASTA'
  | 'INITIAL_MELD_NOT_MET'
  | 'WOULD_LEAVE_UNDISCHARGEABLE_HAND'
  | 'MERGED_MELD_INVALID';

export class CanastaPickupError extends Error {
  public readonly code: CanastaPickupErrorCode;
  constructor(code: CanastaPickupErrorCode, message: string) {
    super(message);
    this.name = 'CanastaPickupError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Meld validation
// ---------------------------------------------------------------------------

export interface MeldCheckOk {
  ok: true;
  rank: string;
  naturals: number;
  wilds: number;
  isBlackThrees: boolean;
}
export interface MeldCheckErr { ok: false; error: string; }
export type MeldCheckResult = MeldCheckOk | MeldCheckErr;

/**
 * Validate a proposed NEW meld built from the given cards + (optional) a
 * top-of-discard card attached.
 */
export function validateNewMeld(cards: Card[], opts: { goingOut?: boolean } = {}): MeldCheckResult {
  if (cards.length < 3) return { ok: false, error: 'Meld must have at least 3 cards' };

  const naturals = cards.filter((c) => !isWild(c));
  const wilds = cards.filter((c) => isWild(c));

  // Red 3s are never melded \u2014 they're bonus cards placed face-up automatically.
  if (cards.some(isRedThree)) {
    return { ok: false, error: 'Red 3s cannot be melded' };
  }

  // Black 3s: only as an exit meld, no wilds.
  const allBlack3s = naturals.length > 0 && naturals.every(isBlackThree);
  if (allBlack3s) {
    if (wilds.length > 0) return { ok: false, error: 'Black-3 meld cannot contain wild cards' };
    if (!opts.goingOut) return { ok: false, error: 'Black 3s can only be melded when going out' };
    return { ok: true, rank: '3', naturals: naturals.length, wilds: 0, isBlackThrees: true };
  }

  if (naturals.some(isBlackThree)) {
    return { ok: false, error: 'Cannot mix black 3s with other ranks' };
  }

  if (naturals.length === 0) {
    return { ok: false, error: 'Meld must contain at least one natural card' };
  }
  if (wilds.length >= naturals.length) {
    return { ok: false, error: 'Meld must contain more naturals than wilds' };
  }
  if (wilds.length > 3) {
    return { ok: false, error: 'Meld may not contain more than 3 wild cards' };
  }

  const rank = naturals[0]!.rank;
  if (!rank) return { ok: false, error: 'Natural meld card missing rank' };
  for (const c of naturals) {
    if (c.rank !== rank) return { ok: false, error: `Mixed ranks in meld (${rank} vs ${c.rank})` };
  }

  return { ok: true, rank, naturals: naturals.length, wilds: wilds.length, isBlackThrees: false };
}

/**
 * Validate adding cards to an existing meld. Enforces: rank match, wild cap,
 * natural-majority cap (for ongoing meld), and "no wilds on a black-3 meld".
 */
export function validateMeldExtension(
  existing: CanastaMeld,
  added: Card[],
): MeldCheckResult {
  const newNaturals = existing.naturals + added.filter((c) => !isWild(c)).length;
  const newWilds = existing.wilds + added.filter(isWild).length;

  if (existing.blackThrees) {
    return { ok: false, error: 'Black-3 melds cannot be extended' };
  }
  if (added.some(isRedThree)) {
    return { ok: false, error: 'Red 3s cannot be melded' };
  }
  if (newWilds > 3) {
    return { ok: false, error: 'Meld may not contain more than 3 wild cards' };
  }
  if (newWilds >= newNaturals) {
    return { ok: false, error: 'Meld must contain more naturals than wilds' };
  }

  // Every non-wild added must be the same rank as the meld.
  for (const c of added) {
    if (!isWild(c) && c.rank !== existing.rank) {
      return { ok: false, error: `Rank ${c.rank} does not match meld rank ${existing.rank}` };
    }
  }
  return { ok: true, rank: existing.rank, naturals: newNaturals, wilds: newWilds, isBlackThrees: false };
}

function meldFromCards(cards: Card[], check: MeldCheckOk): CanastaMeld {
  const isCanasta = cards.length >= 7;
  return {
    rank: check.rank,
    cards: [
      ...cards.filter((c) => !isWild(c)),
      ...cards.filter((c) => isWild(c)),
    ].map((c) => ({ ...c, faceUp: true })),
    naturals: check.naturals,
    wilds: check.wilds,
    isCanasta,
    canastaType: isCanasta ? (check.wilds === 0 ? 'natural' : 'mixed') : undefined,
    blackThrees: check.isBlackThrees || undefined,
  };
}

function extendMeld(existing: CanastaMeld, added: Card[], check: MeldCheckOk): CanastaMeld {
  const naturals = added.filter((c) => !isWild(c)).map((c) => ({ ...c, faceUp: true }));
  const wilds = added.filter(isWild).map((c) => ({ ...c, faceUp: true }));
  const combined = [
    ...existing.cards.filter((c) => !isWild(c)),
    ...naturals,
    ...existing.cards.filter((c) => isWild(c)),
    ...wilds,
  ];
  const isCanasta = combined.length >= 7;
  return {
    ...existing,
    cards: combined,
    naturals: check.naturals,
    wilds: check.wilds,
    isCanasta,
    canastaType: isCanasta ? (check.wilds === 0 ? 'natural' : 'mixed') : existing.canastaType,
  };
}

/** Sum of natural card-point values in a meld (excluding bonus items). */
function meldNaturalPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + canastaCardPoints(c), 0);
}

/**
 * Fold every non-black-threes meld of the given rank into a single meld.
 * Canasta rules forbid two open melds of the same rank for one side; a
 * frozen pile pickup can create that state (the player forms a new meld
 * with the top card while their side already has a meld of that rank),
 * so we merge here and re-check the wild-cap invariants. Throws a
 * CanastaPickupError('MERGED_MELD_INVALID') if the merged meld would
 * violate wild limits — exceedingly unlikely because the frozen path
 * always produces an all-natural new meld, but enforced for defence.
 */
function mergeSameRankMelds(melds: CanastaMeld[], rank: string): CanastaMeld[] {
  const sameRank = melds.filter((m) => !m.blackThrees && m.rank === rank);
  if (sameRank.length <= 1) return melds;

  const allCards = sameRank.flatMap((m) => m.cards);
  const naturals = allCards.filter((c) => !isWild(c));
  const wilds = allCards.filter(isWild);

  if (wilds.length > 3 || wilds.length >= naturals.length) {
    throw new CanastaPickupError(
      'MERGED_MELD_INVALID',
      'Merging same-rank melds would violate the wild-card cap',
    );
  }

  const isCanasta = allCards.length >= 7;
  const merged: CanastaMeld = {
    rank,
    cards: [...naturals, ...wilds].map((c) => ({ ...c, faceUp: true })),
    naturals: naturals.length,
    wilds: wilds.length,
    isCanasta,
    canastaType: isCanasta ? (wilds.length === 0 ? 'natural' : 'mixed') : undefined,
  };

  const others = melds.filter((m) => m.blackThrees || m.rank !== rank);
  return [...others, merged];
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class CanastaEngine implements IGameEngine {
  readonly gameId = 'canasta';
  readonly supportsAsync = false;
  readonly minPlayers = 2;
  readonly maxPlayers = 4;

  startGame(config: GameConfig): GameState {
    const { roomId, gameId, playerIds } = config;
    const variant = variantFor(playerIds.length);

    const cards = buildCanastaDeck();
    shuffle(cards);

    const meldKeys: string[] = variant === '4p'
      ? ['A', 'B']
      : [...playerIds];
    const redThrees: Record<string, Card[]> = Object.fromEntries(meldKeys.map((k) => [k, []]));

    // Deal with red-3 auto-replacement.
    let pile: Card[] = cards;
    const hands: Record<string, Card[]> = Object.fromEntries(playerIds.map((id) => [id, []]));
    const perPlayer = dealSize(variant);
    for (let round = 0; round < perPlayer; round++) {
      for (const pid of playerIds) {
        const side = sideOf(variant, playerIds, pid);
        const { drawn, drawPile: np, redThrees: nr } = drawOneAutoRed3(pile, redThrees, side);
        pile = np;
        Object.assign(redThrees, nr);
        if (drawn) hands[pid]!.push({ ...drawn, faceUp: false });
      }
    }

    // Turn up the opening card. If it's a red 3, place it to the first side
    // and freeze the pile (Hoyle's: red 3 turn-up is treated like a wild up-card).
    let discardFrozen = false;
    let top: Card | null = null;
    while (pile.length > 0) {
      const card = pile[pile.length - 1]!;
      pile = pile.slice(0, -1);
      if (isRedThree(card)) {
        // Assign to dealer's side (arbitrary \u2014 we use first meldKey).
        const side = meldKeys[0]!;
        redThrees[side] = [...(redThrees[side] ?? []), { ...card, faceUp: true }];
        discardFrozen = true;
        continue;
      }
      top = { ...card, faceUp: true };
      break;
    }
    if (top && (isWild(top) || isBlackThree(top))) {
      // Wild up-card freezes the pile; black-3 up-card blocks the pile for
      // everyone until it is replaced. Both are effectively a freeze.
      discardFrozen = true;
    }

    const players = playerIds.map((pid) => ({
      playerId: pid,
      displayName: pid,
      hand: hands[pid]!,
      score: 0,
      isOut: false,
      isBot: false,
    }));

    const scores: Record<string, number> = Object.fromEntries(meldKeys.map((k) => [k, 0]));
    const scoresPriorHand = { ...scores };

    const publicData: CanastaPublicData = {
      gamePhase: 'draw',
      variant,
      drawPile: pile,
      drawPileSize: pile.length,
      discardPile: top ? [top] : [],
      discardTop: top,
      discardFrozen,
      meldKeys,
      melds: Object.fromEntries(meldKeys.map((k) => [k, []])),
      redThrees,
      initialMeldDone: Object.fromEntries(meldKeys.map((k) => [k, false])),
      initialMeldDoneAtTurnStart: Object.fromEntries(meldKeys.map((k) => [k, false])),
      scores,
      scoresPriorHand,
      goOutRequirement: goOutReq(variant),
      drawCount: drawCount(variant),
      dealerIndex: 0,
      log: [],
    };

    logger.debug('CanastaEngine.startGame', { roomId, variant, playerCount: playerIds.length });

    return {
      version: 1,
      roomId,
      gameId,
      phase: 'playing',
      players,
      currentTurn: playerIds[(0 + 1) % playerIds.length]!, // left of dealer leads
      turnNumber: 1,
      roundNumber: 1,
      publicData: publicData as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  applyAction(state: GameState, playerId: string, action: PlayerAction): GameState {
    if (state.currentTurn !== playerId) throw new Error(`Not ${playerId}'s turn`);
    const pd = state.publicData as unknown as CanastaPublicData;

    switch (action.type) {
      case 'draw':         return this.handleDraw(state, playerId, pd);
      case 'take-discard': return this.handleTakeDiscard(state, playerId, action, pd);
      case 'meld':         return this.handleMeld(state, playerId, action, pd);
      case 'discard':      return this.handleDiscard(state, playerId, action, pd);
      default: throw new Error(`Unknown action: ${action.type}`);
    }
  }

  getValidActions(state: GameState, playerId: string): PlayerAction[] {
    if (state.currentTurn !== playerId) return [];
    const pd = state.publicData as unknown as CanastaPublicData;
    const out: PlayerAction[] = [];
    if (pd.gamePhase === 'draw') {
      out.push({ type: 'draw' });
      if (pd.discardTop) out.push({ type: 'take-discard' });
      return out;
    }
    // In meld-discard a player can make melds or discard.
    const player = state.players.find((p) => p.playerId === playerId);
    if (!player) return out;
    out.push(...player.hand.map((c) => ({ type: 'discard' as const, cardIds: [c.id] })));
    return out;
  }

  computeResult(state: GameState): PlayerRanking[] {
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    return sorted.map((p, idx) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      rank: idx + 1,
      score: p.score,
      isBot: p.isBot,
    }));
  }

  isGameOver(state: GameState): boolean {
    return state.phase === 'ended';
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  private handleDraw(state: GameState, playerId: string, pd: CanastaPublicData): GameState {
    if (pd.gamePhase !== 'draw') throw new Error('Already drew this turn');
    const side = sideOf(pd.variant, state.players.map((p) => p.playerId), playerId);
    let pile = [...pd.drawPile];
    let reds = { ...pd.redThrees };
    const addedToHand: Card[] = [];
    for (let i = 0; i < pd.drawCount; i++) {
      const { drawn, drawPile: np, redThrees: nr } = drawOneAutoRed3(pile, reds, side);
      pile = np;
      reds = nr;
      if (!drawn) break;
      addedToHand.push({ ...drawn, faceUp: false });
    }

    // If the stock is empty after the draw, the hand ends immediately.
    if (pile.length === 0 && addedToHand.length < pd.drawCount) {
      const newPlayers = state.players.map((p) =>
        p.playerId === playerId ? { ...p, hand: [...p.hand, ...addedToHand] } : p,
      );
      return this.endHand(state, newPlayers, { ...pd, drawPile: pile, redThrees: reds }, playerId, false);
    }

    const newPlayers = state.players.map((p) =>
      p.playerId === playerId ? { ...p, hand: [...p.hand, ...addedToHand] } : p,
    );
    return {
      ...state,
      version: state.version + 1,
      players: newPlayers,
      publicData: {
        ...pd,
        drawPile: pile,
        drawPileSize: pile.length,
        redThrees: reds,
        gamePhase: 'meld-discard',
        // Snapshot initial-meld flags for concealed-going-out detection.
        initialMeldDoneAtTurnStart: { ...pd.initialMeldDone },
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleTakeDiscard(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: CanastaPublicData,
  ): GameState {
    if (pd.gamePhase !== 'draw') throw new Error('Must draw (or take) at start of turn');
    // Step 1 — pile takeable at all? Stable error codes so UI/bot consumers
    // can branch on a specific rejection without parsing messages.
    if (!pd.discardTop || pd.discardPile.length === 0) {
      throw new CanastaPickupError('EMPTY_PILE', 'Discard pile is empty');
    }
    if (isBlackThree(pd.discardTop)) {
      throw new CanastaPickupError(
        'BLOCKED_BLACK_THREE',
        'Discard pile is blocked: black 3 on top',
      );
    }
    if (isWild(pd.discardTop)) {
      throw new CanastaPickupError(
        'BLOCKED_WILD_ON_TOP',
        'Discard pile is blocked: wild on top',
      );
    }
    // Defensive: red 3s are laid down immediately on draw, so one should
    // never land on top of the discard pile. Guard anyway so a corrupted
    // state can't silently be picked up (spec E1 / BLOCKED_RED_THREE).
    if (isRedThree(pd.discardTop)) {
      throw new CanastaPickupError(
        'BLOCKED_RED_THREE',
        'Discard pile is blocked: red 3 on top',
      );
    }

    const side = sideOf(pd.variant, state.players.map((p) => p.playerId), playerId);
    const player = state.players.find((p) => p.playerId === playerId)!;

    // The caller provides: which hand-card ids to combine with the top to
    // form/extend a meld. Additional melds in the same action can be passed
    // as payload.melds (same shape as handleMeld).
    const useIds = (action.payload?.useCardIds as string[] | undefined) ?? [];
    const top = pd.discardTop;
    const handSelected = player.hand.filter((c) => useIds.includes(c.id));
    if (handSelected.length !== useIds.length) {
      throw new Error('One or more provided hand cards are not in hand');
    }

    const mySideMelds = pd.melds[side] ?? [];
    const effectivelyFrozen = pd.discardFrozen || !pd.initialMeldDone[side];

    // Determine whether the use-set + top forms a new meld or extends an existing one.
    const extensionTarget = !effectivelyFrozen
      ? mySideMelds.find((m) => m.rank === top.rank && !m.blackThrees)
      : undefined;

    if (extensionTarget) {
      // Extending an existing meld \u2014 top + useIds may be any legal combo.
      const check = validateMeldExtension(extensionTarget, [top, ...handSelected]);
      if (!check.ok) {
        throw new CanastaPickupError(
          'MELD_STRUCTURE_INVALID',
          `Cannot take pile: ${check.error}`,
        );
      }
    } else {
      // Forming a new meld with the top card. When frozen we need at least
      // two naturals of the top card's rank in the hand.
      if (effectivelyFrozen) {
        const naturalMatches = handSelected.filter(
          (c) => !isWild(c) && c.rank === top.rank,
        );
        if (naturalMatches.length < 2) {
          // Distinguish "tried to use wilds while frozen" from generic
          // no-matching-card so UI can explain *why* the pickup failed.
          const attemptedWildMatch = handSelected.some(isWild);
          if (attemptedWildMatch) {
            throw new CanastaPickupError(
              'FROZEN_WILD_MATCH_FORBIDDEN',
              'Frozen pile: two natural matches from hand required (wilds not allowed)',
            );
          }
          throw new CanastaPickupError(
            'NO_MATCHING_CARD',
            'Frozen pile requires two natural matches of the top card from hand',
          );
        }
      } else {
        // Unfrozen new-meld path: surface precise codes before the generic
        // validator runs. A pickup that proposes only wilds to join the top
        // card would fail validateNewMeld's natural-majority rule, but the
        // stable code WILD_ONLY_MATCH_FORBIDDEN is what the spec calls out.
        const naturalsInMeld = [top, ...handSelected].filter((c) => !isWild(c));
        if (naturalsInMeld.length < 2) {
          throw new CanastaPickupError(
            'WILD_ONLY_MATCH_FORBIDDEN',
            'Top card needs at least one natural partner from hand',
          );
        }
        const hasMatchingNatural = handSelected.some(
          (c) => !isWild(c) && c.rank === top.rank,
        );
        if (!hasMatchingNatural) {
          throw new CanastaPickupError(
            'NO_MATCHING_CARD',
            `No natural ${top.rank} in hand to match the top card`,
          );
        }
      }
      const check = validateNewMeld([top, ...handSelected]);
      if (!check.ok) {
        throw new CanastaPickupError(
          'MELD_STRUCTURE_INVALID',
          `Cannot take pile: ${check.error}`,
        );
      }
    }

    // Apply take: hand receives all pile cards EXCEPT the top (which goes
    // straight into the meld along with handSelected).
    const pileCards = pd.discardPile.slice(0, -1); // everything beneath top
    const newHand = [
      ...player.hand.filter((c) => !useIds.includes(c.id)),
      ...pileCards.map((c) => ({ ...c, faceUp: false })),
    ];

    // Apply the meld (extend or new).
    const newMelds = { ...pd.melds, [side]: [...(pd.melds[side] ?? [])] };
    let initialMeldPoints = 0;

    if (extensionTarget) {
      const check = validateMeldExtension(extensionTarget, [top, ...handSelected]) as MeldCheckOk;
      const updated = extendMeld(extensionTarget, [top, ...handSelected], check);
      newMelds[side] = newMelds[side]!.map((m) => (m === extensionTarget ? updated : m));
    } else {
      const cards = [top, ...handSelected];
      const check = validateNewMeld(cards) as MeldCheckOk;
      newMelds[side] = [...newMelds[side]!, meldFromCards(cards, check)];
      initialMeldPoints = meldNaturalPoints(cards);
    }

    // If a new meld was made AND side had not yet made initial meld, we need
    // to honour the initial-meld threshold including any extra melds declared
    // in the same action. Unified into the single return below so the merge
    // (E6) and undischargeable-hand (E19) checks run regardless of path.
    let newInitialMeldDone = { ...pd.initialMeldDone };
    let handAfter = [...newHand];
    if (!pd.initialMeldDone[side]) {
      const additional = (action.payload?.melds as string[][] | undefined) ?? [];
      let extraPoints = 0;
      for (const group of additional) {
        const cs = handAfter.filter((c) => group.includes(c.id));
        if (cs.length !== group.length) throw new Error('Additional meld cards not all in hand');
        const check = validateNewMeld(cs);
        if (!check.ok) {
          throw new CanastaPickupError(
            'MELD_STRUCTURE_INVALID',
            `Extra meld invalid: ${check.error}`,
          );
        }
        extraPoints += meldNaturalPoints(cs);
        handAfter = handAfter.filter((c) => !group.includes(c.id));
        newMelds[side] = [...newMelds[side]!, meldFromCards(cs, check as MeldCheckOk)];
      }
      const prior = pd.scoresPriorHand[side] ?? 0;
      const required = initialMeldMinimum(prior);
      if (initialMeldPoints + extraPoints < required) {
        throw new CanastaPickupError(
          'INITIAL_MELD_NOT_MET',
          `Initial meld ${initialMeldPoints + extraPoints} < required ${required}`,
        );
      }
      newInitialMeldDone = { ...newInitialMeldDone, [side]: true };
    }

    // E6: merge same-rank melds. Only the frozen path can leave the side with
    // two melds of the top card's rank (unfrozen path auto-extends an
    // existing meld instead of creating a new one). Additional melds in the
    // initial-meld flow could also introduce a same-rank duplicate. Fold any
    // duplicates into one meld and re-check the wild-cap invariants.
    const topRank = top.rank;
    if (topRank) {
      newMelds[side] = mergeSameRankMelds(newMelds[side]!, topRank);
    }

    // E19: reject a pickup that would leave the player unable to discard.
    // Default rules require a discard to end the turn (even when going out),
    // so an empty hand post-pickup is always rejected in batch 1. When the
    // require_discard_to_go_out flag ships in batch 2 this guard will relax
    // for the "concealed going-out without discard" variant.
    if (handAfter.length === 0) {
      throw new CanastaPickupError(
        'WOULD_LEAVE_UNDISCHARGEABLE_HAND',
        'Pickup would leave you with no cards to discard',
      );
    }

    return this.advanceToMeldDiscard(
      state,
      state.players.map((p) => (p.playerId === playerId ? { ...p, hand: handAfter } : p)),
      {
        ...pd,
        melds: newMelds,
        initialMeldDone: newInitialMeldDone,
        initialMeldDoneAtTurnStart: {
          ...pd.initialMeldDoneAtTurnStart,
          [side]: pd.initialMeldDone[side] ?? false,
        },
        discardPile: [],
        discardTop: null,
        discardFrozen: false,
      },
    );
  }

  /**
   * handleMeld: Lays down one or more melds / extensions. Accepts an action
   *   payload of the shape:
   *     { melds: Array<{ cardIds: string[]; extend?: string }> }
   *   where `extend` is an existing meld's rank (and, if ambiguous, picks the
   *   first matching non-black-threes meld). Omit `extend` for new melds.
   */
  private handleMeld(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: CanastaPublicData,
  ): GameState {
    if (pd.gamePhase !== 'meld-discard') throw new Error('Must draw first');
    const side = sideOf(pd.variant, state.players.map((p) => p.playerId), playerId);
    const player = state.players.find((p) => p.playerId === playerId)!;
    const groups = (action.payload?.melds as Array<{ cardIds: string[]; extend?: string; goingOut?: boolean }> | undefined)
      ?? (action.cardIds ? [{ cardIds: action.cardIds }] : []);
    if (groups.length === 0) throw new Error('No melds specified');

    let workHand = [...player.hand];
    const newMelds = { ...pd.melds, [side]: [...(pd.melds[side] ?? [])] };
    let newMeldsForSide = newMelds[side]!;
    let initialPointsThisTurn = 0;

    for (const group of groups) {
      const cs = workHand.filter((c) => group.cardIds.includes(c.id));
      if (cs.length !== group.cardIds.length) throw new Error('Meld cards not in hand');

      if (group.extend) {
        const target = newMeldsForSide.find((m) => m.rank === group.extend && !m.blackThrees);
        if (!target) throw new Error(`No existing meld of rank ${group.extend} to extend`);
        const check = validateMeldExtension(target, cs);
        if (!check.ok) throw new Error(`Extension invalid: ${check.error}`);
        const updated = extendMeld(target, cs, check as MeldCheckOk);
        newMeldsForSide = newMeldsForSide.map((m) => (m === target ? updated : m));
        // Extending does NOT count toward initial meld threshold (initial
        // must be NEW melds).
      } else {
        const check = validateNewMeld(cs, { goingOut: group.goingOut });
        if (!check.ok) throw new Error(`Meld invalid: ${check.error}`);
        initialPointsThisTurn += meldNaturalPoints(cs);
        newMeldsForSide = [...newMeldsForSide, meldFromCards(cs, check as MeldCheckOk)];
      }
      workHand = workHand.filter((c) => !group.cardIds.includes(c.id));
    }

    if (!pd.initialMeldDone[side]) {
      const prior = pd.scoresPriorHand[side] ?? 0;
      const required = initialMeldMinimum(prior);
      if (initialPointsThisTurn < required) {
        throw new Error(`Initial meld ${initialPointsThisTurn} < required ${required}`);
      }
    }

    const newInitialMeldDone = { ...pd.initialMeldDone };
    if (initialPointsThisTurn > 0) newInitialMeldDone[side] = true;

    newMelds[side] = newMeldsForSide;
    return {
      ...state,
      version: state.version + 1,
      players: state.players.map((p) => (p.playerId === playerId ? { ...p, hand: workHand } : p)),
      publicData: {
        ...pd,
        melds: newMelds,
        initialMeldDone: newInitialMeldDone,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  private handleDiscard(
    state: GameState,
    playerId: string,
    action: PlayerAction,
    pd: CanastaPublicData,
  ): GameState {
    if (pd.gamePhase !== 'meld-discard') throw new Error('Must draw first');
    const cardId = action.cardIds?.[0];
    if (!cardId) throw new Error('No card specified');

    const side = sideOf(pd.variant, state.players.map((p) => p.playerId), playerId);
    const player = state.players.find((p) => p.playerId === playerId)!;
    const card = player.hand.find((c) => c.id === cardId);
    if (!card) throw new Error('Card not in hand');
    if (isRedThree(card)) throw new Error('Red 3s cannot be discarded');

    const newHand = player.hand.filter((c) => c.id !== cardId);
    const faceUp = { ...card, faceUp: true };
    const newDiscardPile = [...pd.discardPile, faceUp];
    const newDiscardFrozen = pd.discardFrozen || isWild(card);

    // Going-out check: hand empty after discard + meets canasta requirement.
    const sideCanastas = (pd.melds[side] ?? []).filter((m) => m.isCanasta).length;
    if (newHand.length === 0) {
      if (sideCanastas < pd.goOutRequirement) {
        throw new Error(`Need ${pd.goOutRequirement} canasta(s) to go out`);
      }
      // Concealed going-out: the side had not yet melded at the START of this
      // turn (so everything including a canasta was laid down this turn).
      const concealed = !pd.initialMeldDoneAtTurnStart[side];
      return this.endHand(
        state,
        state.players.map((p) => (p.playerId === playerId ? { ...p, hand: [], isOut: true } : p)),
        { ...pd, discardPile: newDiscardPile, discardTop: faceUp, discardFrozen: newDiscardFrozen },
        playerId,
        concealed,
      );
    }

    // Next player.
    const order = state.players.map((p) => p.playerId);
    const nextId = order[(order.indexOf(playerId) + 1) % order.length]!;

    return {
      ...state,
      version: state.version + 1,
      players: state.players.map((p) => (p.playerId === playerId ? { ...p, hand: newHand } : p)),
      currentTurn: nextId,
      turnNumber: state.turnNumber + 1,
      publicData: {
        ...pd,
        gamePhase: 'draw',
        discardPile: newDiscardPile,
        discardTop: faceUp,
        discardFrozen: newDiscardFrozen,
      } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers: state transitions
  // -------------------------------------------------------------------------

  private advanceToMeldDiscard(
    state: GameState,
    newPlayers: GameState['players'],
    pd: CanastaPublicData,
  ): GameState {
    return {
      ...state,
      version: state.version + 1,
      players: newPlayers,
      publicData: { ...pd, gamePhase: 'meld-discard' } as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * End-of-hand scoring and possibly game-over check.
   * Scoring per Hoyle's:
   *   + canasta bonuses (500 natural / 300 mixed, per canasta)
   *   + red 3 bonuses (100 each; 800 if all 4; negative if no meld this hand)
   *   + going-out bonus (100 or 200 concealed) for the player who went out
   *   + sum of card-point values of cards in all melds of that side
   *   \u2212 sum of card-point values of cards remaining in hand for each player
   *     on that side
   *
   * After scoring, if any side has reached 5,000 the game ends. Otherwise a
   * fresh hand is dealt with the deal rotating one seat.
   */
  private endHand(
    state: GameState,
    newPlayers: GameState['players'],
    pd: CanastaPublicData,
    goingOutPlayerId: string | null,
    concealed: boolean,
  ): GameState {
    const playerIds = state.players.map((p) => p.playerId);
    const newScores = { ...pd.scores };
    const goingOutSide = goingOutPlayerId
      ? sideOf(pd.variant, playerIds, goingOutPlayerId)
      : null;

    for (const side of pd.meldKeys) {
      const sideMelds = pd.melds[side] ?? [];
      let total = 0;

      // Canasta bonuses.
      for (const m of sideMelds) {
        if (m.isCanasta) total += m.canastaType === 'natural' ? 500 : 300;
      }

      // Red-3 bonuses (or penalty if never melded).
      const reds = pd.redThrees[side] ?? [];
      const hasMelded = sideMelds.length > 0;
      const baseRed = reds.length === 4 ? 800 : reds.length * 100;
      total += hasMelded ? baseRed : -baseRed;

      // Going-out bonus for the winning side.
      if (side === goingOutSide) {
        total += concealed ? 200 : 100;
      }

      // Meld card points.
      for (const m of sideMelds) {
        total += m.cards.reduce((s, c) => s + canastaCardPoints(c), 0);
      }

      // Deadwood deduction: every hand of a player on this side.
      const sidePlayers = newPlayers.filter(
        (p) => sideOf(pd.variant, playerIds, p.playerId) === side,
      );
      for (const p of sidePlayers) {
        total -= p.hand.reduce((s, c) => s + canastaCardPoints(c), 0);
      }

      newScores[side] = (newScores[side] ?? 0) + total;
    }

    const playersWithScores = newPlayers.map((p) => ({
      ...p,
      score: newScores[sideOf(pd.variant, playerIds, p.playerId)] ?? 0,
    }));

    const gameOver = Object.values(newScores).some((s) => s >= 5000);

    if (gameOver) {
      return {
        ...state,
        version: state.version + 1,
        phase: 'ended',
        players: playersWithScores,
        currentTurn: null,
        publicData: {
          ...pd,
          gamePhase: 'ended',
          scores: newScores,
        } as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      };
    }

    // Deal the next hand. Deal rotates to the next player.
    const newDealerIndex = (pd.dealerIndex + 1) % playerIds.length;
    const nextConfig: GameConfig = {
      roomId: state.roomId,
      gameId: state.gameId,
      playerIds,
      asyncMode: false,
      turnTimerSeconds: null,
    };
    const freshState = this.startGame(nextConfig);

    // Carry forward cumulative scores as pre-hand scores for the new deal.
    const carriedPd = freshState.publicData as unknown as CanastaPublicData;
    const mergedPd: CanastaPublicData = {
      ...carriedPd,
      scores: newScores,
      scoresPriorHand: { ...newScores },
      dealerIndex: newDealerIndex,
    };

    return {
      ...freshState,
      version: state.version + 1,
      roundNumber: state.roundNumber + 1,
      // Preserve player identities; adopt the fresh hands from the re-deal.
      players: freshState.players.map((fp, i) => ({
        ...state.players[i]!,
        hand: fp.hand,
        isOut: false,
        score: newScores[sideOf(pd.variant, playerIds, state.players[i]!.playerId)] ?? 0,
      })),
      currentTurn: playerIds[(newDealerIndex + 1) % playerIds.length]!,
      publicData: mergedPd as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    };
  }
}
