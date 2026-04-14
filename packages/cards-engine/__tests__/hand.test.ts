import { Hand } from '../src/Hand';
import { createStandardDeck } from '../src/deckTypes/standard';
import type { Card } from '@card-platform/shared-types';

function makeSampleCards(): Card[] {
  const deck = createStandardDeck();
  return deck.cards.slice(0, 5);
}

describe('Hand', () => {
  it('starts empty', () => {
    const hand = new Hand();
    expect(hand.cards).toHaveLength(0);
  });

  it('addCard adds a card', () => {
    const hand = new Hand();
    const [card] = makeSampleCards();
    hand.addCard(card);
    expect(hand.cards).toHaveLength(1);
    expect(hand.cards[0]).toBe(card);
  });

  it('addCard adds multiple cards', () => {
    const hand = new Hand();
    const cards = makeSampleCards();
    cards.forEach((c) => hand.addCard(c));
    expect(hand.cards).toHaveLength(5);
  });

  it('removeCard removes a card by id', () => {
    const hand = new Hand();
    const cards = makeSampleCards();
    cards.forEach((c) => hand.addCard(c));
    hand.removeCard(cards[2].id);
    expect(hand.cards).toHaveLength(4);
    expect(hand.cards.find((c) => c.id === cards[2].id)).toBeUndefined();
  });

  it('removeCard returns the removed card', () => {
    const hand = new Hand();
    const [card] = makeSampleCards();
    hand.addCard(card);
    const removed = hand.removeCard(card.id);
    expect(removed).toBe(card);
  });

  it('removeCard returns undefined if card not found', () => {
    const hand = new Hand();
    const result = hand.removeCard('nonexistent');
    expect(result).toBeUndefined();
  });

  it('getByIds returns the correct cards', () => {
    const hand = new Hand();
    const cards = makeSampleCards();
    cards.forEach((c) => hand.addCard(c));
    const ids = [cards[0].id, cards[3].id];
    const result = hand.getByIds(ids);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(expect.arrayContaining(ids));
  });

  it('sort orders standard cards by value ascending', () => {
    const hand = new Hand();
    const deck = createStandardDeck();
    // Add a few cards in reverse order
    hand.addCard(deck.cards[12]); // K
    hand.addCard(deck.cards[0]);  // A
    hand.addCard(deck.cards[5]);  // 6
    hand.sort();
    const values = hand.cards.map((c) => c.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});
