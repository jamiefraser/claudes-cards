import type { DeckType } from '@card-platform/shared-types';
import type { CardWithMeta } from '../Card';

/**
 * Returns the SVG path for a given card.
 * For cards with explicit svgPath metadata, returns that path.
 * Otherwise derives the path from card properties.
 */
export function getSvgPath(card: CardWithMeta): string {
  if (card.svgPath) {
    return card.svgPath;
  }

  if (card.deckType === 'standard' && card.suit && card.rank) {
    return `svg/standard/${card.suit}-${card.rank}.svg`;
  }

  if (card.deckType === 'phase10') {
    if (card.phase10Type === 'number' && card.phase10Color) {
      return `svg/phase10/${card.phase10Color}-${card.value}.svg`;
    }
    if (card.phase10Type === 'wild') {
      return `svg/phase10/wild-1.svg`;
    }
    if (card.phase10Type === 'skip') {
      return `svg/phase10/skip-1.svg`;
    }
  }

  return `svg/unknown.svg`;
}

/**
 * Returns the path to the card back SVG for a given deck type.
 */
export function getCardBack(deckType: DeckType): string {
  switch (deckType) {
    case 'standard':
      return 'svg/standard/back.svg';
    case 'phase10':
      return 'svg/phase10/back.svg';
    default:
      return 'svg/standard/back.svg';
  }
}
