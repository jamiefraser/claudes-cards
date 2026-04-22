/**
 * App — root component with React Router and global providers.
 * Routes per SPEC.md §6.
 */
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthProvider';
import { useAuth } from '@/auth/useAuth';
import { ToastProvider, useToast } from '@/components/shared/Toast';
import { ConnectionBanner } from '@/components/shared/ConnectionBanner';
import { useTheme } from '@/hooks/useTheme';
import { logger } from '@/utils/logger';

import { LandingPage } from '@/pages/LandingPage';
import { LobbyPage } from '@/pages/LobbyPage';
import { TablePage } from '@/pages/TablePage';
import { LeaderboardPage } from '@/pages/LeaderboardPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AdminPage } from '@/pages/AdminPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { CreditsPage } from '@/pages/CreditsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Listens for `auth:reauth-required` (dispatched by tokenRefresh when a
 * silent refresh fails) and forces a clean logout + redirect to landing
 * so the user gets a clear path back in. Toasted so they understand why
 * they were sent back instead of seeing a half-broken protected page.
 */
function ReauthListener() {
  const { logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const handler = () => {
      logger.warn('App: auth:reauth-required — forcing logout');
      // Avoid spamming toasts if multiple 401s race in.
      if (isAuthenticated) {
        toast('Session expired — please sign in again.', 'warn');
      }
      logout();
      navigate('/', { replace: true });
    };
    window.addEventListener('auth:reauth-required', handler);
    return () => window.removeEventListener('auth:reauth-required', handler);
  }, [logout, navigate, toast, isAuthenticated]);

  return null;
}

/**
 * ThemeBoot — reads the user's theme preference from localStorage and
 * imperatively applies `data-theme` to <html> on first render. Kept at
 * the top of the app tree so every route paints in the chosen palette.
 */
function ThemeBoot() {
  useTheme();
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <ThemeBoot />
            <ReauthListener />
            <ConnectionBanner />
            <Routes>
              {/* Public */}
              <Route path="/" element={<LandingPage />} />

              {/* Authenticated — any role */}
              <Route path="/lobby" element={<LobbyPage />} />
              <Route path="/table/:roomId" element={<TablePage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/settings" element={<SettingsPage />} />

              {/* Authenticated — moderator+ (role enforced inside AdminPage) */}
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/reports" element={<AdminPage />} />
              <Route path="/admin/users" element={<AdminPage />} />
              <Route path="/admin/games" element={<AdminPage />} />
              <Route path="/admin/leaderboards" element={<AdminPage />} />

              {/* Credits */}
              <Route path="/credits" element={<CreditsPage />} />

              {/* 404 */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
