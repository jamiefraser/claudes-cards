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

// Mock gameStore with clearSelection + canasta pickup-mode state.
// ActionBar drives pickup mode through the store now (the Take Top button
// is gone — the discard pile click in GameTable calls startCanastaPickup),
// so the tests drive it the same way: flip `pickupState.active` before
// rendering to simulate "user clicked the pile".
const mockClearSelection = vi.fn();
let pickupState: {
  active: boolean;
  stagedMelds: Array<{
    id: string;
    cards: Array<{ id: string; rank?: string; suit?: string }>;
    includesTop: boolean;
  }>;
} = { active: false, stagedMelds: [] };
const mockSetCanastaStagedMelds = vi.fn(
  (melds: typeof pickupState.stagedMelds) => {
    pickupState = { ...pickupState, stagedMelds: melds };
  },
);
const mockCancelCanastaPickup = vi.fn(() => {
  pickupState = { active: false, stagedMelds: [] };
});
const mockStartCanastaPickup = vi.fn(() => {
  pickupState = { active: true, stagedMelds: [] };
});
vi.mock('@/store/gameStore', () => ({
  useGameStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      clearSelection: mockClearSelection,
      canastaPickup: pickupState,
      setCanastaStagedMelds: mockSetCanastaStagedMelds,
      cancelCanastaPickup: mockCancelCanastaPickup,
      startCanastaPickup: mockStartCanastaPickup,
    }),
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
  handSize?: number;
  sideCanastaCount?: number;
  goOutRequirement?: number;
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
        // Defaults deliberately make the player NOT in a going-out position
        // so the existing non-black-3 tests aren't affected. Override per
        // test when exercising the going-out flow.
        handSize: props.handSize ?? 10,
        sideCanastaCount: props.sideCanastaCount ?? 0,
        goOutRequirement: props.goOutRequirement ?? 1,
      }}
    />,
  );
}

beforeEach(() => {
  mockEmit.mockClear();
  mockClearSelection.mockClear();
  mockSetCanastaStagedMelds.mockClear();
  mockCancelCanastaPickup.mockClear();
  mockStartCanastaPickup.mockClear();
  pickupState = { active: false, stagedMelds: [] };
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

describe('ActionBar — Canasta black-3 exit meld (going-out)', () => {
  const BLACK3_SELECTION = {
    selectedCardIds: ['b1', 'b2', 'b3'],
    selectedCards: [
      { id: 'b1', rank: '3', suit: 'clubs' },
      { id: 'b2', rank: '3', suit: 'spades' },
      { id: 'b3', rank: '3', suit: 'clubs' },
    ],
  };

  it('enables Meld when hand has exactly selection+1 cards and side has enough canastas', () => {
    renderCanasta({
      ...BLACK3_SELECTION,
      handSize: 4,             // 3 black 3s + 1 discard
      sideCanastaCount: 1,
      goOutRequirement: 1,
    });
    const meldBtn = screen.getByLabelText(/meld selected/i);
    expect(meldBtn).not.toBeDisabled();
  });

  it('disables Meld when side has zero canastas (cannot go out)', () => {
    renderCanasta({
      ...BLACK3_SELECTION,
      handSize: 4,
      sideCanastaCount: 0,
      goOutRequirement: 1,
    });
    const meldBtn = screen.getByLabelText(/meld selected/i);
    expect(meldBtn).toBeDisabled();
  });

  it('disables Meld when hand has more than selection+1 cards', () => {
    renderCanasta({
      ...BLACK3_SELECTION,
      handSize: 6,             // would leave 3 cards in hand; can't go out
      sideCanastaCount: 1,
      goOutRequirement: 1,
    });
    const meldBtn = screen.getByLabelText(/meld selected/i);
    expect(meldBtn).toBeDisabled();
  });

  it('on click sends { melds: [{ cardIds, goingOut: true }] }', () => {
    renderCanasta({
      ...BLACK3_SELECTION,
      handSize: 4,
      sideCanastaCount: 1,
      goOutRequirement: 1,
    });
    const meldBtn = screen.getByLabelText(/meld selected/i);
    fireEvent.click(meldBtn);
    expect(mockEmit).toHaveBeenCalledWith(
      'game_action',
      expect.objectContaining({
        action: expect.objectContaining({
          type: 'meld',
          payload: {
            melds: [{ cardIds: ['b1', 'b2', 'b3'], goingOut: true }],
          },
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Take-Top (take-discard) — multi-rank partition + threshold pre-check.
// The pickup can include a second meld from hand so the player reaches the
// initial-meld threshold with the pile's top card. Engine Step 4 sums card
// points across all melds in the plan.
// ---------------------------------------------------------------------------

function renderCanastaDraw(props: {
  selectedCardIds: string[];
  selectedCards: Array<{ id: string; rank?: string; suit?: string }>;
  discardTopRank?: string;
  initialMeldDone?: boolean;
  sideScorePrior?: number;
  discardFrozen?: boolean;
  isMyTurn?: boolean;
  extendableMelds?: Array<{ rank: string; naturals: number; wilds: number; isCanasta: boolean }>;
}) {
  return render(
    <ActionBar
      roomId="room-1"
      isMyTurn={props.isMyTurn ?? true}
      selectedCardIds={props.selectedCardIds}
      gameId="canasta"
      canasta={{
        phase: 'draw',
        selectedCards: props.selectedCards,
        extendableMelds: props.extendableMelds ?? [],
        handSize: 11,
        sideCanastaCount: 0,
        goOutRequirement: 1,
        discardTopRank: props.discardTopRank,
        discardFrozen: props.discardFrozen ?? false,
        initialMeldDone: props.initialMeldDone ?? true,
        sideScorePrior: props.sideScorePrior ?? 0,
      }}
    />,
  );
}

// Pickup mode is now triggered by the discard-pile click in GameTable
// (which calls the store's startCanastaPickup action). These tests drive
// the store action directly to verify ActionBar's pickup-mode rendering.
describe('ActionBar — Canasta pickup mode entry', () => {
  it('renders the pickup banner when pickupState.active is set', () => {
    pickupState = { active: true, stagedMelds: [] };
    renderCanastaDraw({
      discardTopRank: 'K',
      selectedCardIds: ['k1', 'k2'],
      selectedCards: [
        { id: 'k1', rank: 'K', suit: 'spades' },
        { id: 'k2', rank: 'K', suit: 'clubs' },
      ],
      initialMeldDone: false,
    });
    expect(mockEmit).not.toHaveBeenCalled();
    expect(screen.getByText(/pickup:/i)).toBeInTheDocument();
  });

  it('renders the draw-phase hint (no buttons) when not in pickup mode', () => {
    renderCanastaDraw({
      discardTopRank: 'K',
      selectedCardIds: [],
      selectedCards: [],
    });
    // No Draw Deck / Take Top buttons any more — they live on the piles.
    expect(screen.queryByLabelText(/draw from deck/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/take top card/i)).not.toBeInTheDocument();
    // The bar still hints at what to do.
    expect(screen.getByText(/click the deck/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Take-Top pickup-staging flow. Clicking Take Top enters pickup mode; the
// player builds meld(s) iteratively. First staged meld must include the
// top card. When the running total crosses the initial-meld threshold,
// the compiled plan auto-submits as a single take-discard action.
// ---------------------------------------------------------------------------

describe('ActionBar — Canasta pickup staging (iterative flow)', () => {
  // Pickup mode is entered via the store action startCanastaPickup (called
  // from GameTable's discard-pile onClick). In this unit test we set the
  // pickup-state flag directly and render ActionBar, simulating that the
  // pile has just been clicked.
  function enterPickupMode(opts: {
    selectedCards?: Array<{ id: string; rank?: string; suit?: string }>;
    selectedCardIds?: string[];
    discardTopRank: string;
    initialMeldDone?: boolean;
    sideScorePrior?: number;
  }) {
    pickupState = { active: true, stagedMelds: [] };
    return render(
      <ActionBar
        roomId="room-1"
        isMyTurn={true}
        selectedCardIds={opts.selectedCardIds ?? []}
        gameId="canasta"
        canasta={{
          phase: 'draw',
          selectedCards: opts.selectedCards ?? [],
          extendableMelds: [],
          handSize: 11,
          sideCanastaCount: 0,
          goOutRequirement: 1,
          discardTopRank: opts.discardTopRank,
          discardFrozen: false,
          initialMeldDone: opts.initialMeldDone ?? false,
          sideScorePrior: opts.sideScorePrior ?? 0,
        }}
      />,
    );
  }

  it('pickup mode shows progress banner and Cancel, no emit yet', () => {
    enterPickupMode({ discardTopRank: 'K' });
    expect(mockEmit).not.toHaveBeenCalled();
    expect(screen.getByText(/pickup: 0 \/ 50 pts/i)).toBeInTheDocument();
    expect(screen.getByText(/top-card meld still needed/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cancel pickup/i)).toBeInTheDocument();
  });

  it('rejects staging an additional meld before the top-card meld is staged', () => {
    // Selection is 3 Qs (no K) — can't be the first staged meld.
    enterPickupMode({
      discardTopRank: 'K',
      selectedCardIds: ['q1', 'q2', 'q3'],
      selectedCards: [
        { id: 'q1', rank: 'Q', suit: 'hearts' },
        { id: 'q2', rank: 'Q', suit: 'diamonds' },
        { id: 'q3', rank: 'Q', suit: 'clubs' },
      ],
    });
    fireEvent.click(screen.getByLabelText(/stage/i));
    // No emit, no progress toward threshold.
    expect(mockEmit).not.toHaveBeenCalled();
    expect(screen.getByText(/pickup: 0 \/ 50 pts/i)).toBeInTheDocument();
    expect(screen.getByText(/top-card meld still needed/i)).toBeInTheDocument();
  });

  it('auto-submits when top-card meld alone clears the threshold', () => {
    // Top K (10). Selection K, K, Joker → 10+10+50 = 70 + top 10 = 80 >= 50.
    enterPickupMode({
      discardTopRank: 'K',
      selectedCardIds: ['k1', 'k2', 'j1'],
      selectedCards: [
        { id: 'k1', rank: 'K', suit: 'spades' },
        { id: 'k2', rank: 'K', suit: 'clubs' },
        { id: 'j1', rank: undefined, suit: undefined },
      ],
    });
    fireEvent.click(screen.getByLabelText(/stage/i));
    expect(mockEmit).toHaveBeenCalledWith(
      'game_action',
      expect.objectContaining({
        action: expect.objectContaining({
          type: 'take-discard',
          payload: { useCardIds: ['k1', 'k2', 'j1'] },
        }),
      }),
    );
  });

  it('Cancel Pickup calls the store action and does not emit', () => {
    enterPickupMode({ discardTopRank: 'K' });
    fireEvent.click(screen.getByLabelText(/cancel pickup/i));
    expect(mockEmit).not.toHaveBeenCalled();
    expect(mockCancelCanastaPickup).toHaveBeenCalled();
  });

  it('rejects a top-card meld with fewer than 2 naturals of the top rank', () => {
    // Selection K + Joker + Joker — only 1 natural of top rank, insufficient.
    enterPickupMode({
      discardTopRank: 'K',
      selectedCardIds: ['k1', 'j1', 'j2'],
      selectedCards: [
        { id: 'k1', rank: 'K', suit: 'spades' },
        { id: 'j1', rank: undefined, suit: undefined },
        { id: 'j2', rank: undefined, suit: undefined },
      ],
    });
    fireEvent.click(screen.getByLabelText(/stage/i));
    // Meld not staged; banner still shows pending top-card meld.
    expect(mockEmit).not.toHaveBeenCalled();
    expect(screen.getByText(/top-card meld still needed/i)).toBeInTheDocument();
  });

  // The quick-extend fast path (post-initial-meld + empty selection +
  // extendable of top rank → direct take-discard with useCardIds=[]) used
  // to live in ActionBar's Take Top handler. It now lives in GameTable's
  // discard-pile onClick and is covered at that layer.
});
