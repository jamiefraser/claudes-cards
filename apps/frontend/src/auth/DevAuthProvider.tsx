/**
 * DevAuthProvider
 *
 * React context provider for AUTH_MODE=dev.
 * - Calls POST /api/v1/dev/token with a username to obtain a JWT.
 * - Stores the token in localStorage under 'auth_token' (sticky across browser sessions).
 * - Stores the player profile in localStorage under 'auth_player'.
 * - Provides { player, token, isAuthenticated, isLoading, login, logout }.
 *
 * Used by Playwright auth fixture and the dev login UI.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PlayerProfile } from '@shared/auth';
import { AuthContext, AuthContextValue } from './AuthProvider';
import {
  scheduleRefresh,
  cancelRefresh,
  isTokenExpired,
  refreshToken,
  subscribeToTokenChanges,
} from './tokenRefresh';

const TOKEN_KEY = 'auth_token';
const PLAYER_KEY = 'auth_player';

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

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedPlayer = localStorage.getItem(PLAYER_KEY);
    if (storedToken && storedPlayer) {
      try {
        const parsed = JSON.parse(storedPlayer) as PlayerProfile;
        setPlayer(parsed);
        // If the token is already expired (browser was closed past
        // expiry), refresh BEFORE rendering protected routes — that way
        // the first authed request after page load doesn't bounce off a
        // 401. If the refresh succeeds, the token-change listener below
        // updates state; if it fails, the user lands on the landing page.
        if (isTokenExpired(storedToken)) {
          void refreshToken().then((fresh) => {
            if (fresh) setToken(fresh);
            else {
              localStorage.removeItem(TOKEN_KEY);
              localStorage.removeItem(PLAYER_KEY);
              setPlayer(null);
            }
          });
        } else {
          setToken(storedToken);
          // Arm the proactive timer so the next refresh fires before
          // the current token expires.
          scheduleRefresh(storedToken);
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(PLAYER_KEY);
      }
    }
    setIsLoading(false);

    // React to token changes from the refresh path so context stays in
    // sync with localStorage. Without this, useAuth().token would be
    // stale after a refresh and components reading it (e.g. socket auth
    // headers) would still send the old token until next reload.
    const unsub = subscribeToTokenChanges((newToken) => {
      setToken(newToken);
    });
    return () => {
      unsub();
      cancelRefresh();
    };
  }, []);

  const login = useCallback(async (username?: string): Promise<void> => {
    if (!username) {
      throw new Error('DevAuthProvider.login: username is required');
    }
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

      const profile: PlayerProfile = {
        id: data.playerId,
        username: data.username,
        displayName: data.username,
        avatarUrl: null,
        role: data.role as PlayerProfile['role'],
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(PLAYER_KEY, JSON.stringify(profile));

      setToken(data.token);
      setPlayer(profile);
      // Arm proactive refresh so the user never sees a 401 mid-session.
      scheduleRefresh(data.token);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    cancelRefresh();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PLAYER_KEY);
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
