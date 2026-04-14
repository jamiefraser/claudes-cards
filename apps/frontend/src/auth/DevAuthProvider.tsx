/**
 * DevAuthProvider
 *
 * React context provider for AUTH_MODE=dev.
 * - Calls POST /api/v1/dev/token with a username to obtain a JWT.
 * - Stores the token in sessionStorage under 'auth_token'.
 * - Stores the player profile in sessionStorage under 'auth_player'.
 * - Provides { player, token, isAuthenticated, isLoading, login, logout }.
 *
 * Used by Playwright auth fixture and the dev login UI.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PlayerProfile } from '@shared/auth';
import { AuthContext, AuthContextValue } from './AuthProvider';

const TOKEN_KEY = 'auth_token';
const PLAYER_KEY = 'auth_player';

// Relative URL — in production nginx proxies /api to api-service.
// In dev, vite.config.ts proxy forwards /api to http://localhost:3001.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

interface DevTokenResponse {
  token: string;
  playerId: string;
  username: string;
  role: string;
}

export function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate from sessionStorage on mount
  useEffect(() => {
    const storedToken = sessionStorage.getItem(TOKEN_KEY);
    const storedPlayer = sessionStorage.getItem(PLAYER_KEY);
    if (storedToken && storedPlayer) {
      try {
        setToken(storedToken);
        setPlayer(JSON.parse(storedPlayer) as PlayerProfile);
      } catch {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(PLAYER_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (username: string): Promise<void> => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/dev/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error: string };
        throw new Error(body.error ?? 'Failed to obtain dev token');
      }

      const data = (await response.json()) as DevTokenResponse;

      // Build a minimal PlayerProfile from the token response
      // (full profile populated by GET /api/v1/players/me in later units)
      const profile: PlayerProfile = {
        id: data.playerId,
        username: data.username,
        displayName: data.username, // placeholder until /players/me is available
        avatarUrl: null,
        role: data.role as PlayerProfile['role'],
        createdAt: new Date().toISOString(),
      };

      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(PLAYER_KEY, JSON.stringify(profile));

      setToken(data.token);
      setPlayer(profile);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(PLAYER_KEY);
    setToken(null);
    setPlayer(null);
  }, []);

  const value: AuthContextValue = {
    player,
    token,
    isAuthenticated: token !== null && player !== null,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
