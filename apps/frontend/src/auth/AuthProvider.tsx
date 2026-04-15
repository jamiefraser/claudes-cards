/**
 * AuthProvider
 *
 * Selects the appropriate auth provider based on VITE_AUTH_MODE env var.
 * - 'dev'        → DevAuthProvider (local JWT, HS256)
 * - 'production' → MsalAuthProvider (Azure AD B2C)
 *
 * Provides AuthContext consumed by useAuth().
 */

import React, { createContext } from 'react';
import { PlayerProfile } from '@shared/auth';
import { DevAuthProvider } from './DevAuthProvider';
import { MsalAuthProvider } from './MsalAuthProvider';

export interface AuthContextValue {
  player: PlayerProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username?: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const authMode = (import.meta.env.VITE_AUTH_MODE as string | undefined) ?? 'dev';

  if (authMode === 'production') {
    return <MsalAuthProvider>{children}</MsalAuthProvider>;
  }

  return <DevAuthProvider>{children}</DevAuthProvider>;
}
