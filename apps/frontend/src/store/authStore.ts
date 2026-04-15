/**
 * authStore — SPEC.md §7
 * Mirrors the AuthContextValue but as a Zustand store for global access
 * outside React component trees (e.g., from the API client).
 */
import { create } from 'zustand';
import type { PlayerProfile } from '@shared/auth';
import { logger } from '@/utils/logger';

export interface AuthState {
  player: PlayerProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setPlayer: (player: PlayerProfile, token: string) => void;
  clearAuth: () => void;
  refreshToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  player: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,

  setPlayer: (player: PlayerProfile, token: string) => {
    logger.debug('authStore: setPlayer', { playerId: player.id });
    set({ player, token, isAuthenticated: true });
  },

  clearAuth: () => {
    logger.debug('authStore: clearAuth');
    set({ player: null, token: null, isAuthenticated: false });
  },

  /**
   * Refresh the token from localStorage.
   * In dev mode, tokens do not expire within a session; this is a no-op stub
   * that satisfies the store shape. Production MSAL refresh is handled by
   * MsalAuthProvider.
   */
  refreshToken: async (): Promise<void> => {
    const storedToken = localStorage.getItem('auth_token');
    if (!storedToken) {
      logger.warn('authStore: refreshToken called but no stored token found');
      return;
    }
    const current = get();
    if (current.player && storedToken !== current.token) {
      logger.info('authStore: refreshToken — syncing token from localStorage');
      set({ token: storedToken });
    }
  },
}));
