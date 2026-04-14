import { createStandardDeck } from '../src/deckTypes/standard';
import { createPhase10Deck } from '../src/deckTypes/phase10';

describe('Standard Deck', () => {
  it('has exactly 52 cards', () => {
    const deck = createStandardDeck();
    expect(deck.cards).toHaveLength(52);
  });

  it('has no duplicate card IDs', () => {
    const deck = createStandardDeck();
    const ids = deck.cards.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(52);
  });

  it('all cards have altText set', () => {
    const deck = createStandardDeck();
    for (const card of deck.cards) {
      expect(card.altText).toBeTruthy();
    }
  });

  it('deckType is standard', () => {
    const deck = createStandardDeck();
    expect(deck.deckType).toBe('standard');
    for (const card of deck.cards) {
      expect(card.deckType).toBe('standard');
    }
  });
});

describe('Phase 10 Deck', () => {
  it('has exactly 60 cards', () => {
    const deck = createPhase10Deck();
    expect(deck.cards).toHaveLength(60);
  });

  it('has 48 number cards', () => {
    const deck = createPhase10Deck();
    const numbers = deck.cards.filter((c) => c.phase10Type === 'number');
    expect(numbers).toHaveLength(48);
  });

  it('has 8 wild cards', () => {
    const deck = createPhase10Deck();
    const wilds = deck.cards.filter((c) => c.phase10Type === 'wild');
    expect(wilds).toHaveLength(8);
  });

  it('has 4 skip cards', () => {
    const deck = createPhase10Deck();
    const skips = deck.cards.filter((c) => c.phase10Type === 'skip');
    expect(skips).toHaveLength(4);
  });

  it('has no duplicate card IDs', () => {
    const deck = createPhase10Deck();
    const ids = deck.cards.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(60);
  });

  it('all cards have altText set', () => {
    const deck = createPhase10Deck();
    for (const card of deck.cards) {
      expect(card.altText).toBeTruthy();
    }
  });

  it('number cards cover all 4 colors × 12 numbers', () => {
    const deck = createPhase10Deck();
    const numbers = deck.cards.filter((c) => c.phase10Type === 'number');
    const colors = ['red', 'blue', 'green', 'yellow'] as const;
    for (const color of colors) {
      for (let n = 1; n <= 12; n++) {
        const found = numbers.find(
          (c) => c.phase10Color === color && c.value === n
        );
        expect(found).toBeDefined();
      }
    }
  });

  it('deckType is phase10', () => {
    const deck = createPhase10Deck();
    expect(deck.deckType).toBe('phase10');
    for (const card of deck.cards) {
      expect(card.deckType).toBe('phase10');
    }
  });
});
