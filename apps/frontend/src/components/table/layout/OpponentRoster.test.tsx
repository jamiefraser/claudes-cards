import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { OpponentRoster } from './OpponentRoster';

describe('<OpponentRoster />', () => {
  it('renders children in a horizontal flex container', () => {
    render(
      <OpponentRoster>
        <span data-testid="opp1">Opponent 1</span>
        <span data-testid="opp2">Opponent 2</span>
      </OpponentRoster>,
    );
    expect(screen.getByTestId('opp1')).toBeInTheDocument();
    expect(screen.getByTestId('opp2')).toBeInTheDocument();
    const roster = screen.getByTestId('opponent-roster');
    expect(roster).toHaveClass('flex');
    expect(roster).toHaveClass('flex-row');
    expect(roster).toHaveClass('justify-center');
  });
});
