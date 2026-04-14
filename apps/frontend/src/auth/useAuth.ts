/**
 * useAuth hook
 *
 * Reads from the nearest AuthContext.
 * Works in both dev mode (DevAuthProvider) and production mode (MsalAuthProvider).
 */

import { useContext } from 'react';
import { AuthContext, AuthContextValue } from './AuthProvider';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
