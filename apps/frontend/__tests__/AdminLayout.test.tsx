/**
 * AdminLayout tests — SPEC.md §22 Story 11.1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminLayout } from '../src/components/admin/AdminLayout';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../src/auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../src/api/admin.api', () => ({
  getAdminDashboard: vi.fn().mockResolvedValue({
    activePlayers: 42,
    activeRooms: 5,
    pendingReports: 3,
    activelyMuted: 1,
    gamesPlayedToday: 10,
  }),
}));

vi.mock('../src/components/shared/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { useAuth } from '../src/auth/useAuth';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminLayout', () => {
  it('redirects player role to /lobby', () => {
    vi.mocked(useAuth).mockReturnValue({
      player: { id: 'p1', username: 'u', displayName: 'U', avatarUrl: null, role: 'player', createdAt: '' },
      token: 'tok',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    render(<AdminLayout activeTab="reports">{<div />}</AdminLayout>, { wrapper });
    expect(mockNavigate).toHaveBeenCalledWith('/lobby', expect.anything());
  });

  it('renders tabs for moderator role', () => {
    vi.mocked(useAuth).mockReturnValue({
      player: { id: 'p1', username: 'u', displayName: 'U', avatarUrl: null, role: 'moderator', createdAt: '' },
      token: 'tok',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    render(<AdminLayout activeTab="reports">{<div />}</AdminLayout>, { wrapper });
    expect(screen.getByRole('tab', { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /users/i })).toBeInTheDocument();
  });

  it('shows Games and Leaderboards tabs only for admin role', () => {
    vi.mocked(useAuth).mockReturnValue({
      player: { id: 'p1', username: 'u', displayName: 'U', avatarUrl: null, role: 'admin', createdAt: '' },
      token: 'tok',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    render(<AdminLayout activeTab="reports">{<div />}</AdminLayout>, { wrapper });
    expect(screen.getByRole('tab', { name: /games/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /leaderboards/i })).toBeInTheDocument();
  });

  it('hides Games and Leaderboards tabs for moderator role', () => {
    vi.mocked(useAuth).mockReturnValue({
      player: { id: 'p1', username: 'u', displayName: 'U', avatarUrl: null, role: 'moderator', createdAt: '' },
      token: 'tok',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    render(<AdminLayout activeTab="reports">{<div />}</AdminLayout>, { wrapper });
    expect(screen.queryByRole('tab', { name: /^games$/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /^leaderboards$/i })).toBeNull();
  });

  it('renders the dashboard stats section', async () => {
    vi.mocked(useAuth).mockReturnValue({
      player: { id: 'p1', username: 'u', displayName: 'U', avatarUrl: null, role: 'admin', createdAt: '' },
      token: 'tok',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    render(<AdminLayout activeTab="reports">{<div />}</AdminLayout>, { wrapper });
    // Dashboard stats label should be present (async — wait for query result)
    await waitFor(() => {
      expect(screen.getByText(/active players/i)).toBeInTheDocument();
    });
  });
});
