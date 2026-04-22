/**
 * HandComponent tests — SPEC.md §15
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { HandComponent } from '../src/components/cards/HandComponent';
import type { Card } from '@shared/cards';

const mockCards: Card[] = [
  {
    id: 'card-1',
    deckType: 'standard',
    suit: 'hearts',
    rank: 'A',
    value: 1,
    faceUp: true,
  },
  {
    id: 'card-2',
    deckType: 'standard',
    suit: 'spades',
    rank: 'K',
    value: 13,
    faceUp: true,
  },
  {
    id: 'card-3',
    deckType: 'standard',
    suit: 'clubs',
    rank: '5',
    value: 5,
    faceUp: true,
  },
];

describe('HandComponent', () => {
  it('renders the correct number of cards', () => {
    render(
      <HandComponent
        cards={mockCards}
        selectedIds={[]}
        onSelect={vi.fn()}
        disabled={false}
        draggable={false}
      />,
    );
    // 3 cards should each render as buttons
    const cardButtons = screen.getAllByRole('button');
    expect(cardButtons).toHaveLength(3);
  });

  it('marks selected cards', () => {
    const { container } = render(
      <HandComponent
        cards={mockCards}
        selectedIds={['card-1']}
        onSelect={vi.fn()}
        disabled={false}
        draggable={false}
      />,
    );
    expect(container.querySelectorAll('[data-selected="true"]')).toHaveLength(1);
  });

  it('calls onSelect when a card is clicked', () => {
    const handleSelect = vi.fn();
    render(
      <HandComponent
        cards={mockCards}
        selectedIds={[]}
        onSelect={handleSelect}
        disabled={false}
        draggable={false}
      />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(handleSelect).toHaveBeenCalledWith('card-1');
  });

  it('does not call onSelect when disabled', () => {
    const handleSelect = vi.fn();
    render(
      <HandComponent
        cards={mockCards}
        selectedIds={[]}
        onSelect={handleSelect}
        disabled={true}
        draggable={false}
      />,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it('renders empty state when no cards', () => {
    const { container } = render(
      <HandComponent
        cards={[]}
        selectedIds={[]}
        onSelect={vi.fn()}
        disabled={false}
        draggable={false}
      />,
    );
    expect(container.querySelectorAll('[role="button"]')).toHaveLength(0);
  });

  it('renders hand container with aria-label', () => {
    render(
      <HandComponent
        cards={mockCards}
        selectedIds={[]}
        onSelect={vi.fn()}
        disabled={false}
        draggable={false}
      />,
    );
    expect(screen.getByRole('list', { name: /your hand/i })).toBeInTheDocument();
  });

  it('staggers deal animation on multi-card batch, no delay on single-card draw', async () => {
    // Start from empty hand so the deal is "new".
    const { container, rerender } = render(
      <HandComponent
        cards={[]}
        selectedIds={[]}
        onSelect={vi.fn()}
        disabled={false}
        draggable={false}
      />,
    );

    // Deal 6 cards — a multi-card batch, should stagger.
    const six: Card[] = Array.from({ length: 6 }, (_, i) => ({
      id: `deal-${i}`,
      deckType: 'standard',
      suit: 'hearts',
      rank: 'A',
      value: 1,
      faceUp: true,
    }));

    await act(async () => {
      rerender(
        <HandComponent
          cards={six}
          selectedIds={[]}
          onSelect={vi.fn()}
          disabled={false}
          draggable={false}
        />,
      );
    });

    const lis = container.querySelectorAll('[aria-label="Your hand"] > li');
    expect(lis).toHaveLength(6);
    // Every li should carry card-slide-in class and a staggered delay.
    const delays = Array.from(lis).map((li) => (li as HTMLElement).style.animationDelay);
    expect(delays[0]).toBe('0ms');
    expect(delays[1]).toBe('45ms');
    expect(delays[2]).toBe('90ms');
    expect(delays[3]).toBe('135ms');
    expect(delays[4]).toBe('180ms');
    expect(delays[5]).toBe('225ms'); // cap triggers at index 5

    Array.from(lis).forEach((li) => {
      expect((li as HTMLElement).className).toContain('card-slide-in');
    });
  });

  it('does not stagger when only a single card arrives (draw, not deal)', async () => {
    const startTwo: Card[] = mockCards.slice(0, 2);
    const { container, rerender } = render(
      <HandComponent
        cards={startTwo}
        selectedIds={[]}
        onSelect={vi.fn()}
        disabled={false}
        draggable={false}
      />,
    );

    // Draw one new card — single-card batch should NOT stagger.
    await act(async () => {
      rerender(
        <HandComponent
          cards={mockCards}
          selectedIds={[]}
          onSelect={vi.fn()}
          disabled={false}
          draggable={false}
        />,
      );
    });

    const lis = container.querySelectorAll('[aria-label="Your hand"] > li');
    expect(lis).toHaveLength(3);
    // The two pre-existing cards were never "new" post-mount — no animation class.
    // The newly-drawn card gets the class but NO animation-delay.
    const drawn = Array.from(lis).find((li) =>
      (li as HTMLElement).className.includes('card-slide-in'),
    ) as HTMLElement | undefined;
    expect(drawn).toBeDefined();
    expect(drawn!.style.animationDelay).toBe('');
  });
});
