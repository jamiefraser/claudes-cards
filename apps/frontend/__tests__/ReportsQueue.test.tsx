/**
 * ReportsQueue tests — SPEC.md §22 Story 11.2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportsQueue } from '../src/components/admin/ReportsQueue';
import type { PaginatedReports } from '@shared/admin';

vi.mock('../src/api/admin.api', () => ({
  getReports: vi.fn(),
  updateReport: vi.fn(),
}));

vi.mock('../src/hooks/useSocket', () => ({
  getLobbySocket: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
  })),
}));

vi.mock('../src/components/shared/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { getReports } from '../src/api/admin.api';

const mockReports: PaginatedReports = {
  reports: [
    {
      id: 'report-1',
      reportedByPlayerId: 'player-a',
      reportedPlayerId: 'player-b',
      reason: 'Offensive language',
      status: 'PENDING',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'report-2',
      reportedByPlayerId: 'player-c',
      reportedPlayerId: 'player-d',
      reason: 'Cheating',
      status: 'PENDING',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getReports).mockResolvedValue(mockReports);
});

describe('ReportsQueue', () => {
  it('renders a table of pending reports', async () => {
    render(<ReportsQueue />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Offensive language')).toBeInTheDocument();
      expect(screen.getByText('Cheating')).toBeInTheDocument();
    });
  });

  it('shows Review button for each report', async () => {
    render(<ReportsQueue />, { wrapper });
    await waitFor(() => {
      const reviewButtons = screen.getAllByRole('button', { name: /review/i });
      expect(reviewButtons).toHaveLength(2);
    });
  });

  it('opens a review modal when Review is clicked', async () => {
    render(<ReportsQueue />, { wrapper });
    await waitFor(() => screen.getAllByRole('button', { name: /review/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /review/i })[0]);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('shows action buttons in the review modal', async () => {
    render(<ReportsQueue />, { wrapper });
    await waitFor(() => screen.getAllByRole('button', { name: /review/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /review/i })[0]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });
  });

  it('shows empty state when no reports', async () => {
    vi.mocked(getReports).mockResolvedValue({
      reports: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    render(<ReportsQueue />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/no pending reports/i)).toBeInTheDocument();
    });
  });
});
