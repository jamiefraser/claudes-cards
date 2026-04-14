/**
 * MsalAuthProvider (Production — AUTH_MODE=production)
 *
 * Placeholder for Azure AD B2C authentication via MSAL.
 * Full implementation pending human operator provisioning of B2C tenant.
 * See SPEC.md §8 Auth Strategy — Production.
 *
 * This component is written but inactive.
 * AuthProvider will wire it in when VITE_AUTH_MODE=production.
 *
 * TODO: install @azure/msal-browser + @azure/msal-react and implement:
 *   - MsalProvider wrapper
 *   - useMsal hook for token acquisition
 *   - Silent token refresh
 *   - Redirect flow on login
 */

import React from 'react';
import { AuthContext, AuthContextValue } from './AuthProvider';

const NOT_CONFIGURED_VALUE: AuthContextValue = {
  player: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  login: async () => {
    throw new Error('MsalAuthProvider: B2C tenant not yet configured');
  },
  logout: () => {
    // no-op until B2C is configured
  },
};

export function MsalAuthProvider({ children }: { children: React.ReactNode }) {
  // TODO: replace stub with real MSAL implementation once B2C tenant is provisioned.
  return (
    <AuthContext.Provider value={NOT_CONFIGURED_VALUE}>
      {children}
    </AuthContext.Provider>
  );
}
