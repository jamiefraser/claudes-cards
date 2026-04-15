/**
 * LandingPage tests — RTL
 * Landing is a marketing page. In dev mode the sign-in CTA reveals an inline
 * test-user picker; selecting a user and submitting calls login().
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
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function revealDevPicker() {
  // First "Sign in to play" button in the hero reveals the picker in dev mode.
  const ctas = screen.getAllByRole('button', { name: /sign in to play/i });
  fireEvent.click(ctas[0]!);
  return await screen.findByRole('combobox');
}

describe('LandingPage', () => {
  it('renders an h1 heading', () => {
    renderLandingPage();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('advertises games on the landing page', () => {
    renderLandingPage();
    expect(screen.getByRole('heading', { name: /games on the table/i })).toBeInTheDocument();
  });

  it('reveals a test-user picker after clicking the primary CTA in dev mode', async () => {
    renderLandingPage();
    const select = await revealDevPicker();
    const testUserOptions = Array.from(select.querySelectorAll('option')).filter(
      (o) => (o as HTMLOptionElement).value.startsWith('test-'),
    );
    expect(testUserOptions).toHaveLength(5);
  });

  it('defaults to test-player-1 in the dev picker', async () => {
    renderLandingPage();
    const select = (await revealDevPicker()) as HTMLSelectElement;
    expect(select.value).toBe('test-player-1');
  });

  it('calls login with the selected username on submit', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLandingPage();
    const select = await revealDevPicker();

    fireEvent.change(select, { target: { value: 'test-player-2' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test-player-2');
    });
  });

  it('displays an error alert when login throws', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Network error'));
    renderLandingPage();
    await revealDevPicker();

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('navigates to /lobby when login succeeds', async () => {
    mockLogin.mockResolvedValueOnce(undefined);
    renderLandingPage();
    await revealDevPicker();

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/lobby', expect.anything());
    });
  });
});
