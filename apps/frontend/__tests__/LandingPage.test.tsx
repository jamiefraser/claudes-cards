/**
 * LandingPage tests — RTL
 * Tests behavior: renders user selector, calls login on submit.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../src/auth/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    player: null,
    token: null,
    login: mockLogin,
    logout: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { LandingPage } from '../src/pages/LandingPage';

function renderLandingPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LandingPage', () => {
  it('renders an h1 heading', () => {
    renderLandingPage();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders a combobox with exactly 5 test-user options', () => {
    renderLandingPage();
    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option'));
    const testUserOptions = options.filter((o: Element) => (o as HTMLOptionElement).value.startsWith('test-'));
    expect(testUserOptions).toHaveLength(5);
  });

  it('defaults to test-player-1', () => {
    renderLandingPage();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('test-player-1');
  });

  it('calls login with the selected username on submit', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLandingPage();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'test-player-2' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test-player-2');
    });
  });

  it('disables the submit button while login is in progress', async () => {
    let resolveLogin!: () => void;
    mockLogin.mockReturnValueOnce(new Promise<void>(r => { resolveLogin = r; }));

    renderLandingPage();
    const btn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());
    resolveLogin();
  });

  it('displays an error alert when login throws', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Network error'));
    renderLandingPage();

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('navigates to /lobby when login succeeds', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLandingPage();

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/lobby', expect.anything());
    });
  });
});
