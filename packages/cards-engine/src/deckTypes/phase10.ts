import type { Deck, Phase10Color } from '@card-platform/shared-types';
import {
  createPhase10NumberCard,
  createPhase10WildCard,
  createPhase10SkipCard,
} from '../Card';
import type { CardWithMeta } from '../Card';

const COLORS: Phase10Color[] = ['red', 'blue', 'green', 'yellow'];

export interface Phase10Deck extends Deck {
  cards: CardWithMeta[];
}

/**
 * Creates a Phase 10 deck with exactly 60 cards:
 * - 48 number cards: 4 colors × 12 numbers (1–12)
 * - 8 Wild cards
 * - 4 Skip cards
 */
export function createPhase10Deck(): Phase10Deck {
  const cards: CardWithMeta[] = [];

  // 4 colors × 12 numbers = 48 number cards
  for (const color of COLORS) {
    for (let num = 1; num <= 12; num++) {
      // Each color/number combination appears once
      cards.push(createPhase10NumberCard(color, num, 1));
    }
  }

  // 8 Wild cards
  for (let i = 1; i <= 8; i++) {
    cards.push(createPhase10WildCard(i));
  }

  // 4 Skip cards
  for (let i = 1; i <= 4; i++) {
    cards.push(createPhase10SkipCard(i));
  }

  return {
    id: 'phase10',
    deckType: 'phase10',
    cards,
  };
}
