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

  /** Per-table rule flags (see CanastaVariantFlags). */
  flags: CanastaVariantFlags;

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
 * Configurable per-table rule flags. Defaults match Hoyle's "Classic" Canasta;
 * future admin panels or room-creation modals can override individual flags
 * without changing the engine. Stored in publicData so reconnecting clients
 * and bot strategies see a consistent rule set across a game.
 */
export interface CanastaVariantFlags {
  /** Allow adding a wild to an existing natural canasta, converting it to
   *  mixed. Most rule sets forbid this — default false. */
  readonly allowConvertingNaturalCanasta: boolean;
  /** Whether cards acquired from the discard pile on this turn count toward
   *  the initial-meld point threshold. Hoyle's Classic: false. */
  readonly initialMeldMayUsePileCards: boolean;
  /** When stock exhausts, require the current player to take the pile if
   *  they can legally extend a meld; otherwise the hand ends. Default true. */
  readonly forcedPickupAfterStockExhaust: boolean;
  /** Default Canasta rule: the top card of a discard pile taken on the
   *  going-out turn does not relax the discard requirement. Reserved flag
   *  for batch-3 "concealed going-out without discard" variants. */
  readonly requireDiscardToGoOut: boolean;
}

function defaultCanastaFlags(): CanastaVariantFlags {
  return {
    allowConvertingNaturalCanasta: false,
    initialMeldMayUsePileCards: false,
    forcedPickupAfterStockExhaust: true,
    requireDiscardToGoOut: true,
  };
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
  | 'MERGED_MELD_INVALID'
  | 'STOCK_EXHAUSTED_MUST_TAKE_PILE';

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

/**
 * Sum of card-point values across every card in a meld — naturals AND wilds
 * (Joker = 50, two = 20). Used for initial-meld threshold math: every card
 * laid down contributes its face value, including the top card when forming
 * a pickup meld. Bonuses (red 3s, canasta, going-out) are NOT included here —
 * they're applied at hand end, not toward the initial-meld threshold.
 *
 * The old name (`meldNaturalPoints`) was misleading; the body has always
 * summed wilds via `canastaCardPoints`, but the name suggested otherwise.
 */
function meldCardPointTotal(cards: Card[]): number {
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
/**
 * True when the current player's side could legally extend an existing open
 * meld using the top card of the discard pile. Used for spec E8 forced-
 * pickup-after-stock-exhaust: the player is required to take the pile if
 * this returns true while the stock is empty.
 *
 * Conservative: we only confirm an unambiguous forced extension. A pickup
 * that would require hand cards is NOT considered forced — the player can
 * always choose to try a frozen take or a natural-pair pickup, but the
 * engine can't know those are available without simulating every combo.
 */
function canForceExtendPile(pd: CanastaPublicData, side: string): boolean {
  const top = pd.discardTop;
  if (!top) return false;
  if (isBlackThree(top) || isWild(top) || isRedThree(top)) return false;
  // Frozen pile can't be extended — the player would need two naturals from
  // hand to form a new meld, which is not a "forced" obligation.
  if (pd.discardFrozen) return false;
  if (!pd.initialMeldDone[side]) return false;
  const melds = pd.melds[side] ?? [];
  const target = melds.find((m) => !m.blackThrees && m.rank === top.rank);
  if (!target) return false;
  // Natural-canasta guard: if top is natural, extension is fine. If top is
  // natural but the target is a natural canasta, adding a natural keeps it
  // natural — still fine. No wild involved when forcing via top card alone.
  return true;
}

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
      flags: defaultCanastaFlags(),
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
    const pd = this.ensureFlags(state.publicData as unknown as CanastaPublicData);

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

  /**
   * Normalise incoming publicData before any handler runs. Two responsibilities:
   *
   *  1. Backfill `flags` when the persisted state pre-dates CanastaVariantFlags
   *     (batch 2). Without this, pd.flags.xxx reads would throw TypeError on
   *     the first action after redeploy.
   *
   *  2. Merge any duplicate same-rank melds per side. Canasta rules require
   *     at most one open meld per rank per side. Pre-fix states could persist
   *     two Q melds side-by-side after a bot emitted {type:'meld',
   *     cardIds:[Q,Q,Q]} without `extend`. We collapse those on entry so the
   *     rest of the engine never sees an invalid duplicate.
   */
  private ensureFlags(pd: CanastaPublicData): CanastaPublicData {
    const withFlags = pd.flags ? pd : { ...pd, flags: defaultCanastaFlags() };
    const ranksInPlay = new Set<string>();
    for (const sideMelds of Object.values(withFlags.melds ?? {})) {
      for (const m of sideMelds) {
        if (!m.blackThrees) ranksInPlay.add(m.rank);
      }
    }
    if (ranksInPlay.size === 0) return withFlags;
    let changed = false;
    const normalisedMelds: typeof withFlags.melds = {};
    for (const [side, sideMelds] of Object.entries(withFlags.melds ?? {})) {
      let next = sideMelds;
      for (const rank of ranksInPlay) {
        // mergeSameRankMelds throws MERGED_MELD_INVALID if the combined
        // wild count would exceed the cap. That's the right runtime
        // behaviour for a fresh pickup, but for a best-effort
        // normalisation of already-persisted state we swallow the throw
        // and leave the duplicates in place — better to render an
        // imperfect table than to crash every subsequent action.
        try {
          const merged = mergeSameRankMelds(next, rank);
          if (merged !== next) changed = true;
          next = merged;
        } catch (err) {
          logger.warn('CanastaEngine: normalisation skipped invalid merge', {
            side,
            rank,
            err: String(err),
          });
        }
      }
      normalisedMelds[side] = next;
    }
    return changed ? { ...withFlags, melds: normalisedMelds } : withFlags;
  }

  private handleDraw(state: GameState, playerId: string, pd: CanastaPublicData): GameState {
    if (pd.gamePhase !== 'draw') throw new Error('Already drew this turn');
    const side = sideOf(pd.variant, state.players.map((p) => p.playerId), playerId);

    // Stock-exhaust forced-pickup (spec E8). Before attempting the draw,
    // check whether the stock is already empty. If it is AND the current
    // player can legally extend an existing meld with the top discard, they
    // MUST take the pile per the flag; the round does not end yet. If they
    // cannot extend, the hand ends as before.
    if (
      pd.drawPile.length === 0 &&
      pd.flags.forcedPickupAfterStockExhaust &&
      canForceExtendPile(pd, side)
    ) {
      throw new CanastaPickupError(
        'STOCK_EXHAUSTED_MUST_TAKE_PILE',
        'Stock is empty and you can extend a meld with the top card — you must take the pile',
      );
    }

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
    // as payload.melds (same shape as handleMeld). An optional `extend`
    // boolean lets the caller state their intent explicitly — passing
    // extend=true while the pile is frozen surfaces the specific
    // FROZEN_EXTENSION_FORBIDDEN code instead of falling through to the
    // new-meld path and failing there on "no two naturals from hand".
    const rawUseIds = (action.payload?.useCardIds as string[] | undefined) ?? [];
    const explicitExtend = action.payload?.extend === true;
    const top = pd.discardTop;

    const mySideMelds = pd.melds[side] ?? [];
    const effectivelyFrozen = pd.discardFrozen || !pd.initialMeldDone[side];

    // Auto-infer the hand selection when the client submits take-discard
    // with an empty useCardIds. Clicking the pile or "Take Top" with no
    // pre-selection is the natural way to play, and forcing the user to
    // hunt through their hand first is a major UX barrier. The engine
    // picks the simplest legal option:
    //   - Unfrozen + side has a matching open meld → extend with just the top card.
    //   - Otherwise: find two naturals of the top rank in hand and use those.
    // If neither option is available we fall through to the validator below
    // which throws a specific error code the UI can toast.
    let useIds = rawUseIds;
    if (rawUseIds.length === 0) {
      const canExtend =
        !effectivelyFrozen &&
        mySideMelds.some((m) => m.rank === top.rank && !m.blackThrees);
      if (canExtend) {
        // Extension with only the top card — natural-canasta guard will
        // still reject a conversion attempt below.
        useIds = [];
      } else {
        const naturals = player.hand.filter(
          (c) => !isWild(c) && c.rank === top.rank,
        );
        if (naturals.length >= 2) {
          useIds = [naturals[0]!.id, naturals[1]!.id];
        }
      }
    }

    const useIdsSet = new Set(useIds);
    const handSelected = player.hand.filter((c) => useIdsSet.has(c.id));
    if (handSelected.length !== useIds.length) {
      throw new Error('One or more provided hand cards are not in hand');
    }

    // Explicit extend-intent while frozen — spec Step 3 / Step 5
    // FROZEN_EXTENSION_FORBIDDEN. Auto-detection below treats the frozen
    // path as new-meld regardless, but if the caller explicitly asked to
    // extend we return the precise code.
    if (explicitExtend && effectivelyFrozen) {
      throw new CanastaPickupError(
        'FROZEN_EXTENSION_FORBIDDEN',
        'Cannot extend an existing meld while the pile is frozen',
      );
    }

    // Determine whether the use-set + top forms a new meld or extends an existing one.
    const extensionTarget = !effectivelyFrozen
      ? mySideMelds.find((m) => m.rank === top.rank && !m.blackThrees)
      : undefined;

    if (extensionTarget) {
      // Natural-canasta guard: adding a wild to a completed natural canasta
      // converts it to "mixed", which most rule sets forbid. Gated by the
      // allow_converting_natural_canasta flag (default false).
      if (
        !pd.flags.allowConvertingNaturalCanasta &&
        extensionTarget.isCanasta &&
        extensionTarget.canastaType === 'natural' &&
        [top, ...handSelected].some(isWild)
      ) {
        throw new CanastaPickupError(
          'WOULD_CONVERT_NATURAL_CANASTA',
          'Cannot add a wild to a natural canasta (would convert to mixed)',
        );
      }
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
        // Unfrozen new-meld path. Two distinct error cases:
        //   (a) Player's FULL HAND has no matching natural → no possible
        //       pickup via new meld, surface NO_MATCHING_CARD.
        //   (b) Player has a matching natural but chose to SELECT only
        //       wilds → WILD_ONLY_MATCH_FORBIDDEN (distinct because the
        //       fix is different: select a natural instead of a wild).
        const handHasMatching = player.hand.some(
          (c) => !isWild(c) && c.rank === top.rank,
        );
        if (!handHasMatching) {
          throw new CanastaPickupError(
            'NO_MATCHING_CARD',
            `No natural ${top.rank} in hand to match the top card`,
          );
        }
        const selectionHasMatching = handSelected.some(
          (c) => !isWild(c) && c.rank === top.rank,
        );
        if (!selectionHasMatching) {
          throw new CanastaPickupError(
            'WILD_ONLY_MATCH_FORBIDDEN',
            'Selected cards are all wilds — pick a matching natural instead',
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
      initialMeldPoints = meldCardPointTotal(cards);
    }

    // Step 4 — initial-meld threshold on discard pickup.
    //
    //   threshold_sum =
    //     card_point_value(top) + Σ card_point_value(c) for c in pickupMeld.hand
    //                           + Σ Σ card_point_value(c) for each extra meld
    //                             in action.payload.melds, over every card in
    //                             that meld
    //
    // Rules:
    //   - Wilds (Joker = 50, two = 20) count at their full face value.
    //   - The top card counts at its face value.
    //   - Every new meld in the plan contributes — the pickup meld plus all
    //     additional melds the player lays down in the same action.
    //   - Bonuses (red-3 = 100, canasta = 300/500, going-out = 100/200) do
    //     NOT contribute; those are applied at hand end, not to the threshold.
    //   - If `flags.initialMeldMayUsePileCards` is false (default), cards
    //     pulled from under the top of the discard pile don't contribute
    //     even though they land in the meld — gated below.
    //
    // See regression suite "CanastaEngine — initial-meld threshold on discard
    // pickup" in canastaEngine.test.ts for the 13 anchored cases.
    let newInitialMeldDone = { ...pd.initialMeldDone };
    let handAfter = [...newHand];
    if (!pd.initialMeldDone[side]) {
      const additional = (action.payload?.melds as string[][] | undefined) ?? [];
      // Pile-card ids — cards just acquired from under the top of the discard
      // pile. In default rules (initialMeldMayUsePileCards=false) those cards
      // can still be MELDED (they're in hand now) but do NOT count toward the
      // initial-meld point threshold. Track so we can exclude them below.
      const pileCardIds = new Set(pileCards.map((c) => c.id));
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
        const countableCards = pd.flags.initialMeldMayUsePileCards
          ? cs
          : cs.filter((c) => !pileCardIds.has(c.id));
        extraPoints += meldCardPointTotal(countableCards);
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
        // Natural-canasta guard mirrors the pickup path — forbids wild-to-
        // natural-canasta conversion unless the flag is explicitly enabled.
        if (
          !pd.flags.allowConvertingNaturalCanasta &&
          target.isCanasta &&
          target.canastaType === 'natural' &&
          cs.some(isWild)
        ) {
          throw new CanastaPickupError(
            'WOULD_CONVERT_NATURAL_CANASTA',
            'Cannot add a wild to a natural canasta (would convert to mixed)',
          );
        }
        const check = validateMeldExtension(target, cs);
        if (!check.ok) throw new Error(`Extension invalid: ${check.error}`);
        const updated = extendMeld(target, cs, check as MeldCheckOk);
        newMeldsForSide = newMeldsForSide.map((m) => (m === target ? updated : m));
        // Extending does NOT count toward initial meld threshold (initial
        // must be NEW melds).
      } else {
        // "New meld" group. Canasta rules allow at most one meld per rank
        // per side, so if the side already has an open meld of this rank
        // we auto-extend it instead of creating a duplicate record. This
        // covers the common path: the bot strategy (and naive clients)
        // submits {type:'meld', cardIds:[Q,Q,Q]} without an explicit
        // `extend` flag. Pre-fix, that spawned a second Q meld alongside
        // an already-laid Q meld; the UI rendered two "Queen sets"
        // side-by-side, which the user flagged as invalid Canasta.
        const check = validateNewMeld(cs, { goingOut: group.goingOut });
        if (!check.ok) throw new Error(`Meld invalid: ${check.error}`);
        const sameRankExisting = check.isBlackThrees
          ? undefined
          : newMeldsForSide.find(
              (m) => !m.blackThrees && m.rank === check.rank,
            );
        if (sameRankExisting) {
          // Same natural-canasta guard as the explicit-extend branch — a
          // client can't bypass it by omitting `extend`.
          if (
            !pd.flags.allowConvertingNaturalCanasta &&
            sameRankExisting.isCanasta &&
            sameRankExisting.canastaType === 'natural' &&
            cs.some(isWild)
          ) {
            throw new CanastaPickupError(
              'WOULD_CONVERT_NATURAL_CANASTA',
              'Cannot add a wild to a natural canasta (would convert to mixed)',
            );
          }
          const extCheck = validateMeldExtension(sameRankExisting, cs);
          if (!extCheck.ok) throw new Error(`Extension invalid: ${extCheck.error}`);
          const updated = extendMeld(sameRankExisting, cs, extCheck as MeldCheckOk);
          newMeldsForSide = newMeldsForSide.map((m) =>
            m === sameRankExisting ? updated : m,
          );
          // Cards ARE newly laid down this turn (just merged into an
          // existing meld for bookkeeping) — count toward initial meld
          // threshold so a side that hasn't yet melded can legally
          // satisfy it by adding to a meld created in the same action.
          initialPointsThisTurn += meldCardPointTotal(cs);
        } else {
          initialPointsThisTurn += meldCardPointTotal(cs);
          newMeldsForSide = [...newMeldsForSide, meldFromCards(cs, check as MeldCheckOk)];
        }
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

// ---------------------------------------------------------------------------
// Pure pickup validator (batch 3 — spec E17 realisation).
//
// In physical Canasta the "show your match first" rule forbids a player from
// inspecting the buried pile cards before committing to a take. Online, a
// rejected take-discard action never mutates state, so the buried cards
// never leave the server — the spec's two-phase commit is effectively
// achieved by today's single-action flow. What was missing was a way for
// consumers (UI, bot strategies, tests) to PRE-VALIDATE a pickup plan
// without round-tripping through the engine and catching the throw.
//
// canTakeDiscardPile is that pre-flight validator. Same rule surface as
// handleTakeDiscard's Steps 1–5; does not mutate state. Consumers should
// submit a `take-discard` action only when this returns ok; the engine
// re-validates on its side (never trust a client-side check).
//
// Rollback (spec E18) is trivial in a purely functional engine: snapshot
// the GameState object before calling applyAction; restore that snapshot
// if a later step decides the pickup should be undone. No dedicated API
// needed — GameState is JSON-serialisable and the socket layer already
// persists a prior version. See the socket handler for the snapshot point.
// ---------------------------------------------------------------------------

export interface CanastaPickupPlan {
  /** Hand card ids the player intends to combine with the top card. */
  useCardIds?: string[];
  /** Extra melds to lay down in the same action, each as a list of ids. */
  melds?: string[][];
  /** Explicit intent — extend an existing meld rather than form a new one. */
  extend?: boolean;
}

export type CanastaPickupCheckResult =
  | { ok: true }
  | { ok: false; code: CanastaPickupErrorCode; message: string };

export function canTakeDiscardPile(
  state: GameState,
  playerId: string,
  plan: CanastaPickupPlan = {},
): CanastaPickupCheckResult {
  const rawPd = state.publicData as unknown as CanastaPublicData;
  const pd: CanastaPublicData = rawPd.flags
    ? rawPd
    : { ...rawPd, flags: defaultCanastaFlags() };

  if (state.currentTurn !== playerId) {
    return { ok: false, code: 'EMPTY_PILE', message: 'Not this player\'s turn' };
  }

  // Step 1: top-card reachability
  if (!pd.discardTop || pd.discardPile.length === 0) {
    return { ok: false, code: 'EMPTY_PILE', message: 'Discard pile is empty' };
  }
  if (isBlackThree(pd.discardTop)) {
    return { ok: false, code: 'BLOCKED_BLACK_THREE', message: 'Black 3 on top' };
  }
  if (isWild(pd.discardTop)) {
    return { ok: false, code: 'BLOCKED_WILD_ON_TOP', message: 'Wild on top' };
  }
  if (isRedThree(pd.discardTop)) {
    return { ok: false, code: 'BLOCKED_RED_THREE', message: 'Red 3 on top' };
  }

  const top = pd.discardTop;
  const side = sideOf(pd.variant, state.players.map((p) => p.playerId), playerId);
  const player = state.players.find((p) => p.playerId === playerId);
  if (!player) {
    return { ok: false, code: 'NO_MATCHING_CARD', message: 'Player not seated' };
  }

  const useIds = plan.useCardIds ?? [];
  const handSelected = player.hand.filter((c) => useIds.includes(c.id));
  if (handSelected.length !== useIds.length) {
    return {
      ok: false,
      code: 'NO_MATCHING_CARD',
      message: 'One or more selected cards are not in hand',
    };
  }

  const effectivelyFrozen = pd.discardFrozen || !pd.initialMeldDone[side];

  // Step 5: explicit-extend intent while frozen
  if (plan.extend === true && effectivelyFrozen) {
    return {
      ok: false,
      code: 'FROZEN_EXTENSION_FORBIDDEN',
      message: 'Cannot extend while the pile is frozen',
    };
  }

  const mySideMelds = pd.melds[side] ?? [];
  const extensionTarget = !effectivelyFrozen
    ? mySideMelds.find((m) => m.rank === top.rank && !m.blackThrees)
    : undefined;

  if (extensionTarget) {
    if (
      !pd.flags.allowConvertingNaturalCanasta &&
      extensionTarget.isCanasta &&
      extensionTarget.canastaType === 'natural' &&
      [top, ...handSelected].some(isWild)
    ) {
      return {
        ok: false,
        code: 'WOULD_CONVERT_NATURAL_CANASTA',
        message: 'Cannot add wild to natural canasta',
      };
    }
    const check = validateMeldExtension(extensionTarget, [top, ...handSelected]);
    if (!check.ok) {
      return { ok: false, code: 'MELD_STRUCTURE_INVALID', message: check.error };
    }
  } else {
    if (effectivelyFrozen) {
      const naturalMatches = handSelected.filter(
        (c) => !isWild(c) && c.rank === top.rank,
      );
      if (naturalMatches.length < 2) {
        if (handSelected.some(isWild)) {
          return {
            ok: false,
            code: 'FROZEN_WILD_MATCH_FORBIDDEN',
            message: 'Frozen pile: wilds not allowed',
          };
        }
        return {
          ok: false,
          code: 'NO_MATCHING_CARD',
          message: 'Need two naturals of the top card\'s rank',
        };
      }
    } else {
      const handHasMatching = player.hand.some(
        (c) => !isWild(c) && c.rank === top.rank,
      );
      if (!handHasMatching) {
        return {
          ok: false,
          code: 'NO_MATCHING_CARD',
          message: `No natural ${top.rank} in hand`,
        };
      }
      const selectionHasMatching = handSelected.some(
        (c) => !isWild(c) && c.rank === top.rank,
      );
      if (!selectionHasMatching) {
        return {
          ok: false,
          code: 'WILD_ONLY_MATCH_FORBIDDEN',
          message: 'Select a matching natural, not just wilds',
        };
      }
    }
    const check = validateNewMeld([top, ...handSelected]);
    if (!check.ok) {
      return { ok: false, code: 'MELD_STRUCTURE_INVALID', message: check.error };
    }
  }

  // Step 4 — initial-meld threshold. Mirrors handleTakeDiscard's math so the
  // pre-flight check matches the authoritative run. Pile cards are excluded
  // from the threshold when flags.initialMeldMayUsePileCards is false.
  if (!pd.initialMeldDone[side]) {
    const pileCardIds = new Set(
      pd.discardPile.slice(0, -1).map((c) => c.id),
    );
    const extraMelds = plan.melds ?? [];
    let threshold = 0;
    // Points from the new top meld (only counted when forming a new meld,
    // not when extending — extensions don't contribute to the initial meld).
    if (!extensionTarget) {
      threshold += [top, ...handSelected].reduce(
        (s, c) => s + canastaCardPoints(c),
        0,
      );
    }
    // Project hand after top-meld use to mirror the engine's handAfter.
    const pileCards = pd.discardPile.slice(0, -1);
    let handAfter = [
      ...player.hand.filter((c) => !useIds.includes(c.id)),
      ...pileCards,
    ];
    for (const group of extraMelds) {
      const cs = handAfter.filter((c) => group.includes(c.id));
      if (cs.length !== group.length) {
        return {
          ok: false,
          code: 'MELD_STRUCTURE_INVALID',
          message: 'Additional meld cards not all present',
        };
      }
      const check = validateNewMeld(cs);
      if (!check.ok) {
        return { ok: false, code: 'MELD_STRUCTURE_INVALID', message: check.error };
      }
      const countable = pd.flags.initialMeldMayUsePileCards
        ? cs
        : cs.filter((c) => !pileCardIds.has(c.id));
      threshold += countable.reduce((s, c) => s + canastaCardPoints(c), 0);
      handAfter = handAfter.filter((c) => !group.includes(c.id));
    }
    const prior = pd.scoresPriorHand[side] ?? 0;
    const required = initialMeldMinimum(prior);
    if (threshold < required) {
      return {
        ok: false,
        code: 'INITIAL_MELD_NOT_MET',
        message: `Initial meld ${threshold} < required ${required}`,
      };
    }
  }

  return { ok: true };
}
