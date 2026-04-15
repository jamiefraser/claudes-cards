/**
 * MsalAuthProvider (Production — AUTH_MODE=production)
 *
 * Azure AD B2C authentication via MSAL.
 * - Config sourced from VITE_B2C_* env vars.
 * - Uses localStorage cache so sessions stick across browser restarts.
 * - On successful login, mirrors the id token into localStorage under 'auth_token'
 *   so the existing apiFetch / socket code keeps working unchanged.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  PublicClientApplication,
  EventType,
  type AuthenticationResult,
  type AccountInfo,
  InteractionRequiredAuthError,
  BrowserCacheLocation,
} from '@azure/msal-browser';
import { PlayerProfile } from '@shared/auth';
import { AuthContext, AuthContextValue } from './AuthProvider';
import { logger } from '@/utils/logger';

const TOKEN_KEY = 'auth_token';
const PLAYER_KEY = 'auth_player';
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

const clientId = import.meta.env.VITE_B2C_CLIENT_ID as string | undefined;
const authority = import.meta.env.VITE_B2C_AUTHORITY as string | undefined;
const knownAuthorities = (import.meta.env.VITE_B2C_KNOWN_AUTHORITIES as string | undefined)
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean) ?? [];
const redirectUri =
  (import.meta.env.VITE_B2C_REDIRECT_URI as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : '');

const missingConfig = !clientId || !authority || knownAuthorities.length === 0;

const msalInstance = missingConfig
  ? null
  : new PublicClientApplication({
      auth: {
        clientId: clientId!,
        authority: authority!,
        knownAuthorities,
        redirectUri,
        postLogoutRedirectUri: redirectUri,
        navigateToLoginRequestUrl: true,
      },
      cache: {
        cacheLocation: BrowserCacheLocation.LocalStorage,
        storeAuthStateInCookie: false,
      },
    });

const loginRequest = {
  scopes: ['openid', 'profile', 'offline_access'],
};

function profileFromAccount(account: AccountInfo): PlayerProfile {
  const claims = (account.idTokenClaims ?? {}) as Record<string, unknown>;
  const username =
    (claims['emails'] as string[] | undefined)?.[0] ??
    (claims['preferred_username'] as string | undefined) ??
    account.username ??
    account.homeAccountId;
  const displayName =
    (claims['name'] as string | undefined) ??
    (claims['given_name'] as string | undefined) ??
    username;
  return {
    id: account.localAccountId ?? account.homeAccountId,
    username,
    displayName,
    avatarUrl: null,
    role: 'player',
    createdAt: new Date().toISOString(),
  };
}

export function MsalAuthProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const applyAuthResult = useCallback(async (result: AuthenticationResult | null) => {
    if (!result || !result.account) return;
    const idToken = result.idToken;
    localStorage.setItem(TOKEN_KEY, idToken);
    setToken(idToken);

    // Use the claim-derived profile as a placeholder so the UI isn't blank
    // while /auth/me is in flight.
    const placeholder = profileFromAccount(result.account);
    setPlayer(placeholder);

    // Authoritative profile (with the server's DB playerId) comes from /auth/me.
    // The DB id is what room.hostId, socket playerId, etc. all use, so we MUST
    // overwrite the placeholder before any UI checks identity.
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const profile = (await res.json()) as PlayerProfile;
        localStorage.setItem(PLAYER_KEY, JSON.stringify(profile));
        setPlayer(profile);
      } else {
        logger.warn('MsalAuthProvider: /auth/me failed', { status: res.status });
        localStorage.setItem(PLAYER_KEY, JSON.stringify(placeholder));
      }
    } catch (err) {
      logger.warn('MsalAuthProvider: /auth/me error', { err });
      localStorage.setItem(PLAYER_KEY, JSON.stringify(placeholder));
    }
  }, []);

  useEffect(() => {
    if (!msalInstance) {
      setInitError('B2C configuration missing. Set VITE_B2C_* env vars.');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await msalInstance.initialize();

        const redirectResult = await msalInstance.handleRedirectPromise();
        if (cancelled) return;
        if (redirectResult) {
          await applyAuthResult(redirectResult);
        } else {
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            const account = accounts[0];
            msalInstance.setActiveAccount(account);
            try {
              const silent = await msalInstance.acquireTokenSilent({
                ...loginRequest,
                account,
              });
              if (!cancelled) await applyAuthResult(silent);
            } catch (err) {
              if (err instanceof InteractionRequiredAuthError) {
                logger.info('MsalAuthProvider: silent token acquisition needs interaction');
              } else {
                logger.warn('MsalAuthProvider: silent token error', { err });
              }
              const cachedToken = localStorage.getItem(TOKEN_KEY);
              const cachedPlayer = localStorage.getItem(PLAYER_KEY);
              if (cachedToken && cachedPlayer) {
                setToken(cachedToken);
                try {
                  setPlayer(JSON.parse(cachedPlayer) as PlayerProfile);
                } catch {
                  localStorage.removeItem(PLAYER_KEY);
                }
              }
            }
          }
        }

        msalInstance.addEventCallback((ev) => {
          if (
            ev.eventType === EventType.LOGIN_SUCCESS ||
            ev.eventType === EventType.ACQUIRE_TOKEN_SUCCESS
          ) {
            void applyAuthResult(ev.payload as AuthenticationResult);
          }
        });
      } catch (err) {
        logger.warn('MsalAuthProvider: init failed', { err });
        if (!cancelled) setInitError((err as Error).message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyAuthResult]);

  const login = useCallback(async (): Promise<void> => {
    if (!msalInstance) {
      throw new Error(initError ?? 'MSAL not initialised');
    }
    await msalInstance.loginRedirect(loginRequest);
  }, [initError]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PLAYER_KEY);
    setToken(null);
    setPlayer(null);
    if (msalInstance) {
      const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
      void msalInstance.logoutRedirect({
        account,
        postLogoutRedirectUri: redirectUri,
      });
    }
  }, []);

  const value: AuthContextValue = useMemo(
    () => ({
      player,
      token,
      isAuthenticated: token !== null && player !== null,
      isLoading,
      login,
      logout,
    }),
    [player, token, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
