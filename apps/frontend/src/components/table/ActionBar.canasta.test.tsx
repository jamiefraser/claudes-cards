import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionBar } from './ActionBar';

const emit = vi.fn();

vi.mock('@/hooks/useSocket', () => ({
  getGameSocket: () => ({ emit }),
}));

vi.mock('@/store/gameStore', () => ({
  useGameStore: (selector: (s: { clearSelection: () => void }) => unknown) =>
    selector({ clearSelection: vi.fn() }),
}));

vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  emit.mockReset();
});

const baseProps = {
  roomId: 'room-1',
  isMyTurn: true,
  gameId: 'canasta' as const,
};

describe('<ActionBar /> — Canasta', () => {
  it('shows Draw Deck and Take Top in the draw phase', () => {
    render(
      <ActionBar
        {...baseProps}
        selectedCardIds={[]}
        canasta={{ phase: 'draw', selectedCards: [], extendableMelds: [], handSize: 11, sideCanastaCount: 0, goOutRequirement: 1 }}
      />,
    );
    expect(screen.getByRole('button', { name: /draw from deck/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /take top card/i })).toBeInTheDocument();
  });

  it('shows Meld and Discard in the meld-discard phase', () => {
    render(
      <ActionBar
        {...baseProps}
        selectedCardIds={['c1']}
        canasta={{
          phase: 'meld-discard',
          selectedCards: [{ id: 'c1', rank: '7', suit: 'hearts' }],
          extendableMelds: [],
          handSize: 11,
          sideCanastaCount: 0,
          goOutRequirement: 1,
        }}
      />,
    );
    expect(screen.getByRole('button', { name: /meld selected cards/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /discard selected card/i })).toBeInTheDocument();
  });

  it('emits a bare meld action when naturals are selected and no matching side meld exists', async () => {
    render(
      <ActionBar
        {...baseProps}
        selectedCardIds={['c1', 'c2', 'c3']}
        canasta={{
          phase: 'meld-discard',
          selectedCards: [
            { id: 'c1', rank: '7', suit: 'hearts' },
            { id: 'c2', rank: '7', suit: 'diamonds' },
            { id: 'c3', rank: '7', suit: 'clubs' },
          ],
          extendableMelds: [],
          handSize: 11,
          sideCanastaCount: 0,
          goOutRequirement: 1,
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /meld selected cards/i }));
    expect(emit).toHaveBeenCalledWith('game_action', {
      roomId: 'room-1',
      action: { type: 'meld', cardIds: ['c1', 'c2', 'c3'] },
    });
  });

  it('auto-extends an existing side meld of the selected naturals\' rank', async () => {
    render(
      <ActionBar
        {...baseProps}
        selectedCardIds={['c1', 'c2']}
        canasta={{
          phase: 'meld-discard',
          selectedCards: [
            { id: 'c1', rank: '7', suit: 'hearts' },
            { id: 'c2', rank: '2', suit: 'spades' },
          ],
          extendableMelds: [
            { rank: '7', naturals: 3, wilds: 0, isCanasta: false },
          ],
          handSize: 11,
          sideCanastaCount: 0,
          goOutRequirement: 1,
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /meld selected cards/i }));
    expect(emit).toHaveBeenCalledWith('game_action', {
      roomId: 'room-1',
      action: {
        type: 'meld',
        payload: { melds: [{ cardIds: ['c1', 'c2'], extend: '7' }] },
      },
    });
  });

  it('prompts for an extend target when only wild cards are selected', async () => {
    render(
      <ActionBar
        {...baseProps}
        selectedCardIds={['w1', 'w2']}
        canasta={{
          phase: 'meld-discard',
          selectedCards: [
            { id: 'w1', rank: '2', suit: 'spades' },
            { id: 'w2', rank: undefined, suit: undefined },
          ],
          extendableMelds: [
            { rank: '7', naturals: 3, wilds: 0, isCanasta: false },
            { rank: 'K', naturals: 4, wilds: 1, isCanasta: false },
          ],
          handSize: 11,
          sideCanastaCount: 0,
          goOutRequirement: 1,
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /meld selected cards/i }));
    expect(emit).not.toHaveBeenCalled();

    expect(screen.getByRole('dialog', { name: /extend which meld/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /extend Ks/i }));

    expect(emit).toHaveBeenCalledWith('game_action', {
      roomId: 'room-1',
      action: {
        type: 'meld',
        payload: { melds: [{ cardIds: ['w1', 'w2'], extend: 'K' }] },
      },
    });
  });

  it('disables the Meld button when it is not the player\'s turn', () => {
    render(
      <ActionBar
        {...baseProps}
        isMyTurn={false}
        selectedCardIds={['c1', 'c2', 'c3']}
        canasta={{
          phase: 'meld-discard',
          selectedCards: [
            { id: 'c1', rank: '7', suit: 'hearts' },
            { id: 'c2', rank: '7', suit: 'diamonds' },
            { id: 'c3', rank: '7', suit: 'clubs' },
          ],
          extendableMelds: [],
          handSize: 11,
          sideCanastaCount: 0,
          goOutRequirement: 1,
        }}
      />,
    );
    const meldBtn = screen.getByRole('button', { name: /meld selected cards/i });
    expect(meldBtn).toBeDisabled();
  });
});
