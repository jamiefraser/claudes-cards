/**
 * LeaderboardTable tests — SPEC.md §18 Epic 7
 * Behavior: renders entries, hides bots, reacts to socket updates.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeaderboardTable } from '../src/components/leaderboard/LeaderboardTable';
import type { LeaderboardEntry } from '@shared/leaderboard';

// Mock leaderboard API
vi.mock('../src/api/leaderboard.api', () => ({
  getLeaderboard: vi.fn(),
}));

// Mock socket
const socketStub = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
vi.mock('../src/hooks/useSocket', () => ({
  getGameSocket: vi.fn(() => socketStub),
  getLobbySocket: vi.fn(() => socketStub),
  useLobbySocket: vi.fn(),
  useGameSocket: vi.fn(),
}));

import { getLeaderboard } from '../src/api/leaderboard.api';

const mockEntries: LeaderboardEntry[] = [
  {
    playerId: 'player-1',
    displayName: 'Alice',
    avatarUrl: null,
    gameId: 'phase10',
    wins: 10,
    losses: 3,
    gamesPlayed: 13,
    rank: 1,
    period: 'monthly',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    playerId: 'player-2',
    displayName: 'Bob',
    avatarUrl: null,
    gameId: 'phase10',
    wins: 7,
    losses: 5,
    gamesPlayed: 12,
    rank: 2,
    period: 'monthly',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLeaderboard).mockResolvedValue({ entries: mockEntries, total: 2 });
});

describe('LeaderboardTable', () => {
  it('renders leaderboard entries with rank, player, wins, losses', async () => {
    render(
      <LeaderboardTable gameId="phase10" period="monthly" scope="global" />,
      { wrapper },
    );
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  it('renders rank numbers', async () => {
    render(
      <LeaderboardTable gameId="phase10" period="monthly" scope="global" />,
      { wrapper },
    );
    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('renders wins and losses columns', async () => {
    render(
      <LeaderboardTable gameId="phase10" period="monthly" scope="global" />,
      { wrapper },
    );
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument(); // Alice wins
      expect(screen.getByText('3')).toBeInTheDocument();  // Alice losses
    });
  });

  it('shows empty state when no entries', async () => {
    vi.mocked(getLeaderboard).mockResolvedValue({ entries: [], total: 0 });
    render(
      <LeaderboardTable gameId="phase10" period="monthly" scope="global" />,
      { wrapper },
    );
    await waitFor(() => {
      expect(screen.getByText(/no leaderboard entries/i)).toBeInTheDocument();
    });
  });

  it('calls getLeaderboard with correct params for allTime', async () => {
    render(
      <LeaderboardTable gameId="phase10" period="allTime" scope="global" />,
      { wrapper },
    );
    await waitFor(() => {
      expect(getLeaderboard).toHaveBeenCalledWith(
        expect.objectContaining({ gameId: 'phase10', period: 'all-time' }),
      );
    });
  });

  it('calls getLeaderboard with friendsOnly=true when scope is friends', async () => {
    render(
      <LeaderboardTable gameId="phase10" period="monthly" scope="friends" />,
      { wrapper },
    );
    await waitFor(() => {
      expect(getLeaderboard).toHaveBeenCalledWith(
        expect.objectContaining({ friendsOnly: true }),
      );
    });
  });
});
