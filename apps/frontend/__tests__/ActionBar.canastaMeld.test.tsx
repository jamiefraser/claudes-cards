/**
 * ActionBar — Canasta meld handler tests (DEF-002).
 *
 * Table-driven tests for handleCanastaMeld grouping logic:
 *  - single rank, no existing meld -> sends cardIds shorthand
 *  - single rank, existing meld -> sends { melds: [{ cardIds, extend }] }
 *  - multi-rank naturals, no wilds -> sends { melds: [one group per rank] }
 *  - multi-rank + wilds -> opens distribution modal
 *  - all wilds -> opens extend-target modal
 *  - single card selection -> Meld button disabled (DEF-008 pre-validate)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';

// ---- Mocks ---------------------------------------------------------------

const mockEmit = vi.fn();
vi.mock('@/hooks/useSocket', () => ({
  getGameSocket: () => ({
    emit: mockEmit,
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

// Mock gameStore with clearSelection
const mockClearSelection = vi.fn();
vi.mock('@/store/gameStore', () => ({
  useGameStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ clearSelection: mockClearSelection }),
}));

// Stub Toast
vi.mock('@/components/shared/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Stub logger
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import AFTER mocks.
import { ActionBar } from '@/components/table/ActionBar';

function renderCanasta(props: {
  selectedCardIds: string[];
  selectedCards: Array<{ id: string; rank?: string; suit?: string }>;
  extendableMelds?: Array<{ rank: string; naturals: number; wilds: number; isCanasta: boolean }>;
  isMyTurn?: boolean;
}) {
  return render(
    <ActionBar
      roomId="room-1"
      isMyTurn={props.isMyTurn ?? true}
      selectedCardIds={props.selectedCardIds}
      gameId="canasta"
      canasta={{
        phase: 'meld-discard',
        selectedCards: props.selectedCards,
        extendableMelds: props.extendableMelds ?? [],
      }}
    />,
  );
}

beforeEach(() => {
  mockEmit.mockClear();
  mockClearSelection.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('ActionBar — Canasta meld (DEF-002)', () => {
  it('single rank, no existing meld -> sends meld action with cardIds shorthand', () => {
    renderCanasta({
      selectedCardIds: ['c1', 'c2', 'c3'],
      selectedCards: [
        { id: 'c1', rank: '7', suit: 'hearts' },
        { id: 'c2', rank: '7', suit: 'spades' },
        { id: 'c3', rank: '7', suit: 'clubs' },
      ],
    });

    const meldBtn = screen.getByLabelText(/meld selected/i);
    fireEvent.click(meldBtn);

    expect(mockEmit).toHaveBeenCalledWith(
      'game_action',
      expect.objectContaining({
        action: expect.objectContaining({
          type: 'meld',
          cardIds: ['c1', 'c2', 'c3'],
        }),
      }),
    );
  });

  it('single rank, existing meld of same rank -> sends extend payload', () => {
    renderCanasta({
      selectedCardIds: ['c1', 'c2', 'c3'],
      selectedCards: [
        { id: 'c1', rank: 'K', suit: 'hearts' },
        { id: 'c2', rank: 'K', suit: 'spades' },
        { id: 'c3', rank: 'K', suit: 'clubs' },
      ],
      extendableMelds: [{ rank: 'K', naturals: 3, wilds: 0, isCanasta: false }],
    });

    const meldBtn = screen.getByLabelText(/meld selected/i);
    fireEvent.click(meldBtn);

    expect(mockEmit).toHaveBeenCalledWith(
      'game_action',
      expect.objectContaining({
        action: expect.objectContaining({
          type: 'meld',
          payload: expect.objectContaining({
            melds: [{ cardIds: ['c1', 'c2', 'c3'], extend: 'K' }],
          }),
        }),
      }),
    );
  });

  it('multi-rank naturals, no wilds -> sends one meld group per rank', () => {
    renderCanasta({
      selectedCardIds: ['s1', 's2', 's3', 'k1', 'k2', 'k3'],
      selectedCards: [
        { id: 's1', rank: '6', suit: 'hearts' },
        { id: 's2', rank: '6', suit: 'spades' },
        { id: 's3', rank: '6', suit: 'clubs' },
        { id: 'k1', rank: 'K', suit: 'hearts' },
        { id: 'k2', rank: 'K', suit: 'spades' },
        { id: 'k3', rank: 'K', suit: 'clubs' },
      ],
    });

    const meldBtn = screen.getByLabelText(/meld selected/i);
    fireEvent.click(meldBtn);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    const payload = mockEmit.mock.calls[0][1].action.payload;
    expect(payload.melds).toHaveLength(2);
    // Each group should contain only its own rank's cards
    const ranks = payload.melds.map((m: { cardIds: string[] }) => m.cardIds);
    expect(ranks).toEqual(
      expect.arrayContaining([
        ['s1', 's2', 's3'],
        ['k1', 'k2', 'k3'],
      ]),
    );
  });

  it('multi-rank + wilds -> opens distribution modal (does not emit immediately)', () => {
    renderCanasta({
      selectedCardIds: ['s1', 's2', 's3', 'k1', 'k2', 'k3', 'w1'],
      selectedCards: [
        { id: 's1', rank: '6', suit: 'hearts' },
        { id: 's2', rank: '6', suit: 'spades' },
        { id: 's3', rank: '6', suit: 'clubs' },
        { id: 'k1', rank: 'K', suit: 'hearts' },
        { id: 'k2', rank: 'K', suit: 'spades' },
        { id: 'k3', rank: 'K', suit: 'clubs' },
        { id: 'w1', rank: '2', suit: 'hearts' },
      ],
    });

    const meldBtn = screen.getByLabelText(/meld selected/i);
    fireEvent.click(meldBtn);

    // Should NOT have emitted yet — modal should be open
    expect(mockEmit).not.toHaveBeenCalled();
    // The distribution modal should be visible
    expect(screen.getByText(/distribute wild/i)).toBeInTheDocument();
  });

  it('all wilds -> opens extend-target modal', () => {
    renderCanasta({
      selectedCardIds: ['w1', 'w2'],
      selectedCards: [
        { id: 'w1', rank: '2', suit: 'hearts' },
        { id: 'w2', rank: '2', suit: 'spades' },
      ],
      extendableMelds: [{ rank: 'K', naturals: 3, wilds: 0, isCanasta: false }],
    });

    const meldBtn = screen.getByLabelText(/meld selected/i);
    fireEvent.click(meldBtn);

    // Should NOT have emitted directly
    expect(mockEmit).not.toHaveBeenCalled();
    // The extend-target modal should be visible
    expect(screen.getByText(/extend which meld/i)).toBeInTheDocument();
  });

  it('Meld button is disabled for a single non-wild card (DEF-008 pre-validate)', () => {
    renderCanasta({
      selectedCardIds: ['c1'],
      selectedCards: [{ id: 'c1', rank: '7', suit: 'hearts' }],
    });

    const meldBtn = screen.getByLabelText(/meld selected/i);
    expect(meldBtn).toBeDisabled();
  });

  it('Meld button is disabled for two cards of a single rank (less than 3)', () => {
    renderCanasta({
      selectedCardIds: ['c1', 'c2'],
      selectedCards: [
        { id: 'c1', rank: '7', suit: 'hearts' },
        { id: 'c2', rank: '7', suit: 'spades' },
      ],
    });

    const meldBtn = screen.getByLabelText(/meld selected/i);
    expect(meldBtn).toBeDisabled();
  });

  it('Meld button is enabled for 3+ cards of the same rank', () => {
    renderCanasta({
      selectedCardIds: ['c1', 'c2', 'c3'],
      selectedCards: [
        { id: 'c1', rank: '7', suit: 'hearts' },
        { id: 'c2', rank: '7', suit: 'spades' },
        { id: 'c3', rank: '7', suit: 'clubs' },
      ],
    });

    const meldBtn = screen.getByLabelText(/meld selected/i);
    expect(meldBtn).not.toBeDisabled();
  });

  it('Meld button is enabled for multi-rank naturals totalling 6+ cards', () => {
    renderCanasta({
      selectedCardIds: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'],
      selectedCards: [
        { id: 'a1', rank: '6', suit: 'hearts' },
        { id: 'a2', rank: '6', suit: 'spades' },
        { id: 'a3', rank: '6', suit: 'clubs' },
        { id: 'b1', rank: 'K', suit: 'hearts' },
        { id: 'b2', rank: 'K', suit: 'spades' },
        { id: 'b3', rank: 'K', suit: 'clubs' },
      ],
    });

    const meldBtn = screen.getByLabelText(/meld selected/i);
    expect(meldBtn).not.toBeDisabled();
  });

  it('Meld button is enabled for all-wilds selection when extendable melds exist', () => {
    renderCanasta({
      selectedCardIds: ['w1', 'w2'],
      selectedCards: [
        { id: 'w1', rank: '2', suit: 'hearts' },
        { id: 'w2', rank: '2', suit: 'spades' },
      ],
      extendableMelds: [{ rank: 'K', naturals: 3, wilds: 0, isCanasta: false }],
    });

    const meldBtn = screen.getByLabelText(/meld selected/i);
    expect(meldBtn).not.toBeDisabled();
  });
});
