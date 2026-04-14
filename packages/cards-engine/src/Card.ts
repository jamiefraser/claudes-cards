import type { Card as ICard, DeckType, Suit, Rank, Phase10Color, Phase10CardType } from '@card-platform/shared-types';

/**
 * Extended card type with rendering metadata.
 * Extends the shared Card interface with svgPath and altText for display.
 */
export interface CardWithMeta extends ICard {
  /** Path to the SVG asset for this card */
  svgPath: string;
  /** Accessibility text for screen readers */
  altText: string;
}

/** Re-export for convenience */
export type { ICard as Card };

/**
 * Creates a CardWithMeta instance for a standard deck card.
 */
export function createStandardCard(
  suit: Suit,
  rank: Rank,
  value: number,
  faceUp = false
): CardWithMeta {
  const id = `standard:${suit}:${rank}`;
  const svgPath = `svg/standard/${suit}-${rank}.svg`;
  const altText = `${rank} of ${suit}`;
  return {
    id,
    deckType: 'standard' as DeckType,
    suit,
    rank,
    value,
    faceUp,
    svgPath,
    altText,
  };
}

/**
 * Creates a CardWithMeta instance for a Phase 10 number card.
 */
export function createPhase10NumberCard(
  color: Phase10Color,
  num: number,
  instanceIndex: number,
  faceUp = false
): CardWithMeta {
  const id = `phase10:${color}:${num}:${instanceIndex}`;
  const svgPath = `svg/phase10/${color}-${num}.svg`;
  const altText = `Phase 10 ${color} ${num}`;
  return {
    id,
    deckType: 'phase10' as DeckType,
    phase10Color: color,
    phase10Type: 'number' as Phase10CardType,
    value: num,
    faceUp,
    svgPath,
    altText,
  };
}

/**
 * Creates a CardWithMeta instance for a Phase 10 Wild card.
 */
export function createPhase10WildCard(instanceIndex: number, faceUp = false): CardWithMeta {
  const id = `phase10:wild:${instanceIndex}`;
  const svgPath = `svg/phase10/wild-${instanceIndex}.svg`;
  const altText = `Phase 10 Wild card`;
  return {
    id,
    deckType: 'phase10' as DeckType,
    phase10Type: 'wild' as Phase10CardType,
    value: 25, // Wild cards are high value in Phase 10 scoring
    faceUp,
    svgPath,
    altText,
  };
}

/**
 * Creates a CardWithMeta instance for a Phase 10 Skip card.
 */
export function createPhase10SkipCard(instanceIndex: number, faceUp = false): CardWithMeta {
  const id = `phase10:skip:${instanceIndex}`;
  const svgPath = `svg/phase10/skip-${instanceIndex}.svg`;
  const altText = `Phase 10 Skip card`;
  return {
    id,
    deckType: 'phase10' as DeckType,
    phase10Type: 'skip' as Phase10CardType,
    value: 15, // Skip cards count 15 points in scoring
    faceUp,
    svgPath,
    altText,
  };
}
