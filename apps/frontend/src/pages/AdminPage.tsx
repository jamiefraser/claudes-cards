/**
 * AdminPage — admin/moderation UI using AdminLayout tabs.
 * Routes: /admin, /admin/reports, /admin/users, /admin/games, /admin/leaderboards
 * Requires moderator+ role (enforced by AdminLayout).
 * SPEC.md §6, §22
 */
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AdminLayout, AdminTab } from '@/components/admin/AdminLayout';
import { ReportsQueue } from '@/components/admin/ReportsQueue';
import { MuteUserPanel } from '@/components/admin/MuteUserPanel';
import { GameCatalogManager } from '@/components/admin/GameCatalogManager';
import { LeaderboardManager } from '@/components/admin/LeaderboardManager';

function pathToTab(pathname: string): AdminTab {
  if (pathname.includes('/admin/users')) return 'users';
  if (pathname.includes('/admin/games')) return 'games';
  if (pathname.includes('/admin/leaderboards')) return 'leaderboards';
  return 'reports';
}

export function AdminPage() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<AdminTab>(() => pathToTab(location.pathname));

  return (
    <AdminLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'reports' && <ReportsQueue />}
      {activeTab === 'users' && <MuteUserPanel />}
      {activeTab === 'games' && <GameCatalogManager />}
      {activeTab === 'leaderboards' && <LeaderboardManager />}
    </AdminLayout>
  );
}
