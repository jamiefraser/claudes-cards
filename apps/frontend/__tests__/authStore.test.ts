/**
 * authStore tests — SPEC.md §7 store shape
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../src/store/authStore';
import type { PlayerProfile } from '@shared/auth';

const mockPlayer: PlayerProfile = {
  id: 'player-1',
  username: 'test-player-1',
  displayName: 'TestPlayer1',
  avatarUrl: null,
  role: 'player',
  createdAt: new Date().toISOString(),
};

// Reset store to initial state before each test
beforeEach(() => {
  useAuthStore.setState({
    player: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
  });
});

describe('authStore', () => {
  it('starts with null player and not authenticated', () => {
    const state = useAuthStore.getState();
    expect(state.player).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('setPlayer populates player and marks isAuthenticated true', () => {
    const { setPlayer } = useAuthStore.getState();
    setPlayer(mockPlayer, 'tok-abc');
    const state = useAuthStore.getState();
    expect(state.player).toEqual(mockPlayer);
    expect(state.token).toBe('tok-abc');
    expect(state.isAuthenticated).toBe(true);
  });

  it('clearAuth resets all fields', () => {
    const { setPlayer, clearAuth } = useAuthStore.getState();
    setPlayer(mockPlayer, 'tok-abc');
    clearAuth();
    const state = useAuthStore.getState();
    expect(state.player).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('isLoading starts as false', () => {
    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
  });

  it('refreshToken is a function', () => {
    const state = useAuthStore.getState();
    expect(typeof state.refreshToken).toBe('function');
  });

  it('refreshToken does nothing when no token in localStorage', async () => {
    // Ensure no token stored
    localStorage.removeItem('auth_token');
    await useAuthStore.getState().refreshToken();
    // State unchanged
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('refreshToken syncs token from localStorage when different from store', async () => {
    // Set player with old token
    useAuthStore.getState().setPlayer(mockPlayer, 'old-tok');
    // Store a different token in localStorage
    localStorage.setItem('auth_token', 'new-tok');
    await useAuthStore.getState().refreshToken();
    expect(useAuthStore.getState().token).toBe('new-tok');
    // Cleanup
    localStorage.removeItem('auth_token');
  });
});
