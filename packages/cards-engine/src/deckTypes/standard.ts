import type { Deck, Suit, Rank } from '@card-platform/shared-types';
import { createStandardCard } from '../Card';
import type { CardWithMeta } from '../Card';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const RANK_VALUES: Record<Rank, number> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
};

export interface StandardDeck extends Deck {
  cards: CardWithMeta[];
}

/**
 * Creates a standard 52-card deck in suit/rank order (not shuffled).
 */
export function createStandardDeck(): StandardDeck {
  const cards: CardWithMeta[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push(createStandardCard(suit, rank, RANK_VALUES[rank]));
    }
  }

  return {
    id: 'standard',
    deckType: 'standard',
    cards,
  };
}
