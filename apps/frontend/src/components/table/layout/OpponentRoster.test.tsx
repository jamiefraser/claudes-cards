import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { OpponentRoster } from './OpponentRoster';

describe('<OpponentRoster />', () => {
  it('renders all three named slots in a 3-column grid', () => {
    render(
      <OpponentRoster
        leftSlot={<span data-testid="opp-tl">TL</span>}
        centerSlot={<span data-testid="opp-tc">TC</span>}
        rightSlot={<span data-testid="opp-tr">TR</span>}
      />,
    );
    const roster = screen.getByTestId('opponent-roster');
    expect(roster).toHaveClass('grid');
    expect(roster).toHaveClass('grid-cols-3');
    expect(screen.getByTestId('opp-tl')).toBeInTheDocument();
    expect(screen.getByTestId('opp-tc')).toBeInTheDocument();
    expect(screen.getByTestId('opp-tr')).toBeInTheDocument();
  });

  it('renders empty left / right slot wrappers to keep the center seat visually centered', () => {
    render(
      <OpponentRoster centerSlot={<span data-testid="opp-tc">TC</span>} />,
    );
    const roster = screen.getByTestId('opponent-roster');
    // All three slot cells exist even though two are empty.
    expect(roster.querySelector('[data-slot="top-left"]')).not.toBeNull();
    expect(roster.querySelector('[data-slot="top-center"]')).not.toBeNull();
    expect(roster.querySelector('[data-slot="top-right"]')).not.toBeNull();
  });

  it('returns null when every slot is empty', () => {
    const { container } = render(<OpponentRoster />);
    expect(container.firstChild).toBeNull();
  });

  it('sits above the felt via z-10 stacking', () => {
    render(
      <OpponentRoster centerSlot={<span>tc</span>} />,
    );
    expect(screen.getByTestId('opponent-roster')).toHaveClass('z-10');
  });
});
