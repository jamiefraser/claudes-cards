/**
 * WaitingRoom dedupe regression tests.
 *
 * Covers:
 *  - `room_roster` replaces local state (authoritative).
 *  - `player_joined` never double-appends the same playerId.
 *  - Self seeding doesn't race with a `player_joined` for self.
 *  - `player_left` removes a seat; a subsequent re-join restores it once.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ---- Mocks ---------------------------------------------------------------

// getRoom — return a minimal Room so WaitingRoom exits its loading state.
vi.mock('@/api/rooms.api', () => ({
  getRoom: vi.fn().mockResolvedValue({
    id: 'r1',
    gameId: 'phase10',
    hostId: 'p-host',
    name: 'Test Room',
    settings: { maxPlayers: 4, asyncMode: false, turnTimerSeconds: null, isPrivate: false, password: null },
    status: 'waiting',
    createdAt: new Date().toISOString(),
    players: [],
  }),
}));

// useAuth — stub the local player.
vi.mock('@/auth/useAuth', () => ({
  useAuth: () => ({
    player: { id: 'p-self', displayName: 'Self' },
    token: 'tok',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

// Stub useSocket so we can programmatically fire events at the component.
type Handler = (...args: unknown[]) => void;
const handlers = new Map<string, Set<Handler>>();
const fakeSocket = {
  on: (event: string, handler: Handler) => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler);
  },
  off: (event: string, handler: Handler) => {
    handlers.get(event)?.delete(handler);
  },
  emit: vi.fn(),
};
function fire(event: string, payload: unknown) {
  handlers.get(event)?.forEach((h) => h(payload));
}
vi.mock('@/hooks/useSocket', () => ({
  getGameSocket: () => fakeSocket,
}));

// ToastProvider — stub.
vi.mock('@/components/shared/Toast', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
  };
});

// Import AFTER mocks.
import { WaitingRoom } from '@/components/table/WaitingRoom';

function renderWR() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WaitingRoom roomId="r1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  handlers.clear();
});

afterEach(() => {
  cleanup();
});

describe('WaitingRoom — dedupe of player entries', () => {
  it('seeds the local player exactly once even if player_joined for self also arrives', async () => {
    renderWR();
    // Wait for the component to finish fetching room metadata.
    await screen.findByText(/Test Room/i);

    // Simulate the server broadcasting our own join (legacy behaviour).
    act(() => {
      fire('player_joined', { playerId: 'p-self', displayName: 'Self' });
    });

    // Self should appear once.
    const selfEntries = await screen.findAllByText('Self');
    expect(selfEntries).toHaveLength(1);
  });

  it('player_joined for an existing id does not double-add', async () => {
    renderWR();
    await screen.findByText(/Test Room/i);

    act(() => {
      fire('player_joined', { playerId: 'p-other', displayName: 'Other' });
    });
    act(() => {
      fire('player_joined', { playerId: 'p-other', displayName: 'Other' });
    });
    act(() => {
      fire('player_joined', { playerId: 'p-other', displayName: 'Other' });
    });

    const entries = await screen.findAllByText('Other');
    expect(entries).toHaveLength(1);
  });

  it('room_roster replaces the list authoritatively (no append accumulation)', async () => {
    renderWR();
    await screen.findByText(/Test Room/i);

    // Fire a couple of deltas first.
    act(() => {
      fire('player_joined', { playerId: 'p-a', displayName: 'Alice' });
      fire('player_joined', { playerId: 'p-b', displayName: 'Bob' });
    });
    expect(await screen.findByText('Alice')).toBeTruthy();
    expect(await screen.findByText('Bob')).toBeTruthy();

    // Roster snapshot arrives — should REPLACE, not merge.
    act(() => {
      fire('room_roster', {
        players: [
          { playerId: 'p-self', displayName: 'Self' },
          { playerId: 'p-c', displayName: 'Carol' },
        ],
      });
    });

    await waitFor(() => {
      expect(screen.queryByText('Alice')).toBeNull();
      expect(screen.queryByText('Bob')).toBeNull();
    });
    expect(screen.getAllByText('Carol')).toHaveLength(1);
    expect(screen.getAllByText('Self')).toHaveLength(1);
  });

  it('room_roster dedupes its own payload if it arrives with duplicates', async () => {
    renderWR();
    await screen.findByText(/Test Room/i);

    act(() => {
      fire('room_roster', {
        players: [
          { playerId: 'p-d', displayName: 'Dup' },
          { playerId: 'p-d', displayName: 'Dup' },
          { playerId: 'p-d', displayName: 'Dup' },
        ],
      });
    });

    const entries = await screen.findAllByText('Dup');
    expect(entries).toHaveLength(1);
  });

  it('player_left removes the seat', async () => {
    renderWR();
    await screen.findByText(/Test Room/i);

    act(() => {
      fire('player_joined', { playerId: 'p-x', displayName: 'Temporary' });
    });
    expect(await screen.findByText('Temporary')).toBeTruthy();

    act(() => {
      fire('player_left', { playerId: 'p-x' });
    });

    await waitFor(() => {
      expect(screen.queryByText('Temporary')).toBeNull();
    });
  });

  it('re-join after a leave produces exactly one entry', async () => {
    renderWR();
    await screen.findByText(/Test Room/i);

    act(() => {
      fire('player_joined', { playerId: 'p-y', displayName: 'Flaky' });
      fire('player_left', { playerId: 'p-y' });
      fire('player_joined', { playerId: 'p-y', displayName: 'Flaky' });
    });

    const entries = await screen.findAllByText('Flaky');
    expect(entries).toHaveLength(1);
  });
});
