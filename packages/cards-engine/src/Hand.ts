import type { Card } from '@card-platform/shared-types';
import type { CardWithMeta } from './Card';

/**
 * Represents a player's hand of cards.
 * Accepts both base Card and CardWithMeta instances.
 */
export class Hand {
  cards: Array<Card & Partial<CardWithMeta>>;

  constructor(cards: Array<Card & Partial<CardWithMeta>> = []) {
    this.cards = [...cards];
  }

  /**
   * Adds a card to the hand.
   */
  addCard(card: Card & Partial<CardWithMeta>): void {
    this.cards.push(card);
  }

  /**
   * Removes a card by ID and returns it, or undefined if not found.
   */
  removeCard(id: string): (Card & Partial<CardWithMeta>) | undefined {
    const index = this.cards.findIndex((c) => c.id === id);
    if (index === -1) return undefined;
    return this.cards.splice(index, 1)[0];
  }

  /**
   * Returns cards matching the given IDs.
   */
  getByIds(ids: string[]): Array<Card & Partial<CardWithMeta>> {
    const idSet = new Set(ids);
    return this.cards.filter((c) => idSet.has(c.id));
  }

  /**
   * Sorts the hand by card value ascending.
   */
  sort(): void {
    this.cards.sort((a, b) => a.value - b.value);
  }
}
