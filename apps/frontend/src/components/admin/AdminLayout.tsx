/**
 * AdminLayout — shared layout for admin pages.
 * Tabs: Reports | Users | Games (admin only) | Leaderboards (admin only)
 * Role guard: player → redirect /lobby with toast.
 * Dashboard stats display at top.
 * SPEC.md §22 Story 11.1
 */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/useAuth';
import { getAdminDashboard } from '@/api/admin.api';
import { useToast } from '@/components/shared/Toast';
import { logger } from '@/utils/logger';
import type { AdminDashboardStats } from '@shared/admin';
import en from '@/i18n/en.json';

export type AdminTab = 'reports' | 'users' | 'games' | 'leaderboards';

interface AdminLayoutProps {
  activeTab: AdminTab;
  onTabChange?: (tab: AdminTab) => void;
  children: React.ReactNode;
}

const MODERATOR_TABS: AdminTab[] = ['reports', 'users'];
const ADMIN_ONLY_TABS: AdminTab[] = ['games', 'leaderboards'];

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-700/50 rounded-lg px-4 py-3 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

export function AdminLayout({ activeTab, onTabChange, children }: AdminLayoutProps) {
  const { player } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Role guard
  useEffect(() => {
    if (player && player.role === 'player') {
      logger.warn('AdminLayout: access denied for player role');
      toast(en.admin.accessDenied, 'error');
      navigate('/lobby', { replace: true });
    }
  }, [player, navigate, toast]);

  const isAdmin = player?.role === 'admin';

  const { data: stats } = useQuery<AdminDashboardStats>({
    queryKey: ['admin', 'dashboard'],
    queryFn: getAdminDashboard,
    refetchInterval: 30 * 1000,
    enabled: !!player && player.role !== 'player',
  });

  const visibleTabs: AdminTab[] = isAdmin
    ? [...MODERATOR_TABS, ...ADMIN_ONLY_TABS]
    : MODERATOR_TABS;

  const tabLabels: Record<AdminTab, string> = {
    reports:      en.admin.tabs.reports,
    users:        en.admin.tabs.users,
    games:        en.admin.tabs.games,
    leaderboards: en.admin.tabs.leaderboards,
  };

  return (
    <main className="min-h-screen bg-slate-900 py-6 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-4">{en.admin.title}</h1>

        {/* Dashboard stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <StatCard label={en.admin.dashboard.activePlayers} value={stats.activePlayers} />
            <StatCard label={en.admin.dashboard.activeRooms} value={stats.activeRooms} />
            <StatCard label={en.admin.dashboard.pendingReports} value={stats.pendingReports} />
            <StatCard label={en.admin.dashboard.activelyMuted} value={stats.activelyMuted} />
            <StatCard label={en.admin.dashboard.gamesPlayedToday} value={stats.gamesPlayedToday} />
          </div>
        )}

        {/* Tab navigation */}
        <div role="tablist" aria-label={en.admin.title} className="flex gap-1 mb-6 border-b border-slate-700">
          {visibleTabs.map(tab => (
            <button
              key={tab}
              id={`${tab}-tab`}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`${tab}-panel`}
              onClick={() => onTabChange?.(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          role="tabpanel"
          id={`${activeTab}-panel`}
          aria-labelledby={`${activeTab}-tab`}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
