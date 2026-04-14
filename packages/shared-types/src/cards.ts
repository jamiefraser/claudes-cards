/**
 * Card and deck types for the platform.
 * Covers both standard 52-card decks and the Phase 10 deck.
 */

/** The four suits in a standard 52-card deck. */
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

/**
 * The ranks in a standard 52-card deck.
 * A = Ace, J = Jack, Q = Queen, K = King.
 */
export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7'
  | '8' | '9' | '10' | 'J' | 'Q' | 'K';

/** Supported deck types on the platform. */
export type DeckType = 'standard' | 'phase10';

/** The four colors used in the Phase 10 deck. */
export type Phase10Color = 'red' | 'blue' | 'green' | 'yellow';

/** The three card types in the Phase 10 deck. */
export type Phase10CardType = 'number' | 'wild' | 'skip';

/**
 * A single playing card. Supports both standard and Phase 10 decks.
 * - Standard: suit + rank are set; phase10Color and phase10Type are undefined.
 * - Phase 10 number card: phase10Color + rank (1–12); suit is undefined.
 * - Phase 10 Wild: phase10Type = 'wild'; no suit, rank, or color.
 * - Phase 10 Skip: phase10Type = 'skip'; no suit, rank, or color.
 */
export interface Card {
  /** Unique identifier for this card instance within a game session. */
  id: string;
  deckType: DeckType;

  // Standard deck fields
  suit?: Suit;
  rank?: Rank;

  // Phase 10 fields
  phase10Color?: Phase10Color;
  phase10Type?: Phase10CardType;
  /** Numeric value (1–12 for Phase 10 numbers, 1–13 for standard where A=1, J=11, Q=12, K=13) */
  value: number;

  /** True when the card is face-up (visible to all players). */
  faceUp: boolean;
}

/**
 * A collection of cards — used for draw pile, discard pile, or any game structure.
 */
export interface Deck {
  id: string;
  deckType: DeckType;
  cards: Card[];
}
