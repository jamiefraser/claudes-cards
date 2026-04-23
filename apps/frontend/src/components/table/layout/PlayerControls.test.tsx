import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerControls } from './PlayerControls';

vi.mock('@/utils/formatScore', () => ({
  formatScore: (n: number) => String(n),
}));

vi.mock('@/i18n/en.json', () => ({
  default: {
    table: {
      dealerBadgeTooltip: 'Dealer',
      sortHandByRank: 'Sort by rank',
      sortHandBySuit: 'Sort by suit',
      sortRankShort: 'Rank',
      sortSuitShort: 'Suit',
    },
  },
}));

describe('<PlayerControls />', () => {
  const baseProps = {
    displayName: 'Alice',
    score: 1500,
    isDealer: false,
    onSortByRank: vi.fn(),
    onSortBySuit: vi.fn(),
  };

  it('renders the player name and score', () => {
    render(<PlayerControls {...baseProps} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('1500')).toBeInTheDocument();
  });

  it('shows dealer badge when isDealer is true', () => {
    render(<PlayerControls {...baseProps} isDealer={true} />);
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('hides dealer badge when isDealer is false', () => {
    render(<PlayerControls {...baseProps} isDealer={false} />);
    expect(screen.queryByText('D')).not.toBeInTheDocument();
  });

  it('fires onSortByRank when Rank button is clicked', async () => {
    const onSort = vi.fn();
    render(<PlayerControls {...baseProps} onSortByRank={onSort} />);
    await userEvent.click(screen.getByRole('button', { name: /sort by rank/i }));
    expect(onSort).toHaveBeenCalledOnce();
  });

  it('fires onSortBySuit when Suit button is clicked', async () => {
    const onSort = vi.fn();
    render(<PlayerControls {...baseProps} onSortBySuit={onSort} />);
    await userEvent.click(screen.getByRole('button', { name: /sort by suit/i }));
    expect(onSort).toHaveBeenCalledOnce();
  });
});
