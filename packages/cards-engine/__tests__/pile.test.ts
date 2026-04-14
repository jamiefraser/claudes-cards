import { Pile } from '../src/Pile';
import { createStandardDeck } from '../src/deckTypes/standard';
import type { Card } from '@card-platform/shared-types';

function sampleCards(): Card[] {
  return createStandardDeck().cards.slice(0, 5);
}

describe('Pile', () => {
  it('starts empty', () => {
    const pile = new Pile();
    expect(pile.isEmpty()).toBe(true);
    expect(pile.cards).toHaveLength(0);
  });

  it('push adds a card', () => {
    const pile = new Pile();
    const [card] = sampleCards();
    pile.push(card);
    expect(pile.isEmpty()).toBe(false);
    expect(pile.cards).toHaveLength(1);
  });

  it('pop removes and returns the top card', () => {
    const pile = new Pile();
    const cards = sampleCards();
    cards.forEach((c) => pile.push(c));
    const top = pile.pop();
    expect(top).toBe(cards[cards.length - 1]);
    expect(pile.cards).toHaveLength(cards.length - 1);
  });

  it('pop returns undefined when empty', () => {
    const pile = new Pile();
    expect(pile.pop()).toBeUndefined();
  });

  it('peek returns the top card without removing it', () => {
    const pile = new Pile();
    const [card] = sampleCards();
    pile.push(card);
    const peeked = pile.peek();
    expect(peeked).toBe(card);
    expect(pile.cards).toHaveLength(1);
  });

  it('peek returns undefined when empty', () => {
    const pile = new Pile();
    expect(pile.peek()).toBeUndefined();
  });

  it('shuffle reorders cards (statistically unlikely to be identical)', () => {
    const deck = createStandardDeck();
    const pile = new Pile(deck.cards);
    const originalOrder = pile.cards.map((c) => c.id).join(',');
    pile.shuffle();
    const shuffledOrder = pile.cards.map((c) => c.id).join(',');
    // Preserve same number of cards
    expect(pile.cards).toHaveLength(deck.cards.length);
    // Not the same order (astronomically unlikely with 52 cards)
    expect(shuffledOrder).not.toBe(originalOrder);
  });

  it('shuffle preserves all card IDs', () => {
    const deck = createStandardDeck();
    const pile = new Pile(deck.cards);
    const originalIds = new Set(pile.cards.map((c) => c.id));
    pile.shuffle();
    const shuffledIds = new Set(pile.cards.map((c) => c.id));
    expect(shuffledIds).toEqual(originalIds);
  });

  it('isEmpty returns false when cards exist', () => {
    const pile = new Pile();
    const [card] = sampleCards();
    pile.push(card);
    expect(pile.isEmpty()).toBe(false);
  });

  it('can be initialized with cards', () => {
    const cards = sampleCards();
    const pile = new Pile(cards);
    expect(pile.cards).toHaveLength(5);
  });
});
