/**
 * App — root component with React Router and global providers.
 * Routes per SPEC.md §6.
 */
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider } from '@/components/shared/Toast';
import { ConnectionBanner } from '@/components/shared/ConnectionBanner';

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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
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
