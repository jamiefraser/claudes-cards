import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { OpponentBadge } from './OpponentBadge';

describe('<OpponentBadge />', () => {
  it('renders children without rotation when orientation is top', () => {
    render(
      <OpponentBadge orientation="top" displayName="Alice">
        <span data-testid="child">Seat</span>
      </OpponentBadge>,
    );
    const badge = screen.getByTestId('opponent-badge');
    expect(badge).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(badge.style.transform).toBe('');
    expect(badge).toHaveAttribute('data-orientation', 'top');
  });

  it('applies 90deg rotation for left orientation', () => {
    render(
      <OpponentBadge orientation="left" displayName="Bob">
        <span>Seat</span>
      </OpponentBadge>,
    );
    const badge = screen.getByTestId('opponent-badge');
    expect(badge.style.transform).toBe('rotate(90deg)');
    expect(badge).toHaveAttribute('data-orientation', 'left');
  });

  it('applies -90deg rotation for right orientation', () => {
    render(
      <OpponentBadge orientation="right" displayName="Charlie">
        <span>Seat</span>
      </OpponentBadge>,
    );
    const badge = screen.getByTestId('opponent-badge');
    expect(badge.style.transform).toBe('rotate(-90deg)');
    expect(badge).toHaveAttribute('data-orientation', 'right');
  });

  it('sets aria-label with the display name', () => {
    render(
      <OpponentBadge orientation="top" displayName="Diana">
        <span>Seat</span>
      </OpponentBadge>,
    );
    const badge = screen.getByTestId('opponent-badge');
    expect(badge).toHaveAttribute('aria-label', "Diana's seat");
  });
});
