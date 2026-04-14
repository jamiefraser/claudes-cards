/**
 * CardComponent tests — SPEC.md §15
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CardComponent } from '../src/components/cards/CardComponent';
import type { Card } from '@shared/cards';

const mockStandardCard: Card = {
  id: 'card-1',
  deckType: 'standard',
  suit: 'hearts',
  rank: 'A',
  value: 1,
  faceUp: true,
};

const mockFaceDownCard: Card = {
  id: 'card-2',
  deckType: 'standard',
  suit: 'spades',
  rank: 'K',
  value: 13,
  faceUp: false,
};

const mockPhase10Card: Card = {
  id: 'card-3',
  deckType: 'phase10',
  phase10Color: 'red',
  phase10Type: 'number',
  rank: '5',
  value: 5,
  faceUp: true,
};

describe('CardComponent', () => {
  it('renders with correct aria-label for a standard card', () => {
    render(
      <CardComponent
        card={mockStandardCard}
        faceUp={true}
        selected={false}
        ariaLabel="Ace of Hearts"
      />,
    );
    expect(screen.getByRole('button', { name: 'Ace of Hearts' })).toBeInTheDocument();
  });

  it('renders face-down card with back image indicator', () => {
    const { container } = render(
      <CardComponent
        card={mockFaceDownCard}
        faceUp={false}
        selected={false}
      />,
    );
    // Should have a data attribute or class indicating face-down
    expect(container.querySelector('[data-face-down="true"]')).toBeInTheDocument();
  });

  it('applies selected styling when selected=true', () => {
    const { container } = render(
      <CardComponent
        card={mockStandardCard}
        faceUp={true}
        selected={true}
      />,
    );
    expect(container.querySelector('[data-selected="true"]')).toBeInTheDocument();
  });

  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(
      <CardComponent
        card={mockStandardCard}
        faceUp={true}
        selected={false}
        onClick={handleClick}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('calls onClick when Space key is pressed', () => {
    const handleClick = vi.fn();
    render(
      <CardComponent
        card={mockStandardCard}
        faceUp={true}
        selected={false}
        onClick={handleClick}
      />,
    );
    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: ' ', code: 'Space' });
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when no handler provided', () => {
    // should render without errors
    render(
      <CardComponent
        card={mockStandardCard}
        faceUp={true}
        selected={false}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    // no error thrown
  });

  it('renders phase10 card when deckType is phase10', () => {
    const { container } = render(
      <CardComponent
        card={mockPhase10Card}
        faceUp={true}
        selected={false}
      />,
    );
    expect(container.querySelector('[data-deck-type="phase10"]')).toBeInTheDocument();
  });

  it('has draggable attribute when draggable prop is true', () => {
    const { container } = render(
      <CardComponent
        card={mockStandardCard}
        faceUp={true}
        selected={false}
        draggable={true}
      />,
    );
    expect(container.querySelector('[data-draggable="true"]')).toBeInTheDocument();
  });
});
