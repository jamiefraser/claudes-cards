import type { Card } from '@card-platform/shared-types';
import type { CardWithMeta } from './Card';

/**
 * Represents a draw or discard pile.
 * The "top" of the pile is the last element in the array.
 */
export class Pile {
  cards: Array<Card & Partial<CardWithMeta>>;

  constructor(cards: Array<Card & Partial<CardWithMeta>> = []) {
    this.cards = [...cards];
  }

  /**
   * Pushes a card onto the top of the pile.
   */
  push(card: Card & Partial<CardWithMeta>): void {
    this.cards.push(card);
  }

  /**
   * Removes and returns the top card, or undefined if empty.
   */
  pop(): (Card & Partial<CardWithMeta>) | undefined {
    return this.cards.pop();
  }

  /**
   * Returns the top card without removing it, or undefined if empty.
   */
  peek(): (Card & Partial<CardWithMeta>) | undefined {
    if (this.cards.length === 0) return undefined;
    return this.cards[this.cards.length - 1];
  }

  /**
   * Shuffles the pile in-place using Fisher-Yates algorithm.
   */
  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = this.cards[i];
      this.cards[i] = this.cards[j]!;
      this.cards[j] = temp!;
    }
  }

  /**
   * Returns true if the pile has no cards.
   */
  isEmpty(): boolean {
    return this.cards.length === 0;
  }
}
