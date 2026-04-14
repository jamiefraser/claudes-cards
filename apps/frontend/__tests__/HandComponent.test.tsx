/**
 * HandComponent tests — SPEC.md §15
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
