/**
 * Hand-sorting helpers for player hands. Stable sorts so identical-rank or
 * identical-suit cards keep their relative input order.
 */
import type { Card } from '@shared/cards';

const RANK_ORDER: Record<string, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};

const SUIT_ORDER: Record<string, number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
};

function rankRank(c: Card): number {
  if (c.rank && RANK_ORDER[c.rank] !== undefined) return RANK_ORDER[c.rank]!;
  if (typeof c.value === 'number') return c.value;
  return 99;
}

function suitRank(c: Card): number {
  if (c.suit && SUIT_ORDER[c.suit] !== undefined) return SUIT_ORDER[c.suit]!;
  return 99;
}

/** Sort low → high by rank, then by suit as a tiebreaker. */
export function sortByRank(cards: Card[]): string[] {
  return [...cards]
    .sort((a, b) => rankRank(a) - rankRank(b) || suitRank(a) - suitRank(b))
    .map(c => c.id);
}

/** Group by suit, then within each suit sort low → high by rank. */
export function sortBySuit(cards: Card[]): string[] {
  return [...cards]
    .sort((a, b) => suitRank(a) - suitRank(b) || rankRank(a) - rankRank(b))
    .map(c => c.id);
}

/**
 * Apply a stored ordering to a hand: cards in the order array come first in
 * the order specified, then any new cards (not in the order) appear at the
 * end in their incoming order.
 */
export function applyHandOrder(cards: Card[], order: string[] | undefined): Card[] {
  if (!order || order.length === 0) return cards;
  const byId = new Map(cards.map(c => [c.id, c] as const));
  const ordered: Card[] = [];
  for (const id of order) {
    const c = byId.get(id);
    if (c) {
      ordered.push(c);
      byId.delete(id);
    }
  }
  for (const c of cards) {
    if (byId.has(c.id)) ordered.push(c);
  }
  return ordered;
}
