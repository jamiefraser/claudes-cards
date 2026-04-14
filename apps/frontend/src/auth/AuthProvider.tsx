/**
 * AuthProvider
 *
 * Selects the appropriate auth provider based on VITE_AUTH_MODE env var.
 * - 'dev'        → DevAuthProvider (local JWT, HS256)
 * - 'production' → MsalAuthProvider (Azure AD B2C) [not yet active]
 *
 * Provides AuthContext consumed by useAuth().
 */

import React, { createContext } from 'react';
import { PlayerProfile } from '@shared/auth';
import { DevAuthProvider } from './DevAuthProvider';

export interface AuthContextValue {
  player: PlayerProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const authMode = import.meta.env.VITE_AUTH_MODE ?? 'dev';

  if (authMode === 'production') {
    // MsalAuthProvider is a future implementation — active when B2C tenant is provisioned.
    // For now, fall through to DevAuthProvider to avoid blank screens in misconfigured envs.
    // TODO: replace with MsalAuthProvider once production B2C setup is complete.
  }

  // Default to dev mode
  return <DevAuthProvider>{children}</DevAuthProvider>;
}
