/**
 * FilterSidebar — filter panel for the game browser.
 * Allows filtering by game, status, and player availability.
 */
import React from 'react';
import type { RoomListQuery } from '@shared/rooms';
import type { GameCatalogEntry } from '@shared/admin';
import { useLobbyStore } from '@/store/lobbyStore';
import en from '@/i18n/en.json';

interface FilterSidebarProps {
  games: GameCatalogEntry[];
}

export function FilterSidebar({ games }: FilterSidebarProps) {
  const { filters, setFilters } = useLobbyStore();

  const handleGameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ gameId: e.target.value || undefined });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as RoomListQuery['status'];
    setFilters({ status: value || undefined });
  };

  const handleHasSpaceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ hasSpace: e.target.checked ? true : undefined });
  };

  const handleAsyncChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ asyncMode: e.target.checked ? true : undefined });
  };

  return (
    <aside className="w-full md:w-56 md:flex-shrink-0" aria-label={en.lobby.filterTitle}>
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4">
        {en.lobby.filterTitle}
      </h2>

      <div className="flex flex-col gap-4">
        {/* Game filter */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">{en.lobby.filterGame}</span>
          <select
            value={filters.gameId ?? ''}
            onChange={handleGameChange}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-1.5"
            aria-label={en.aria.filterByGame}
          >
            <option value="">{en.lobby.filterAllGames}</option>
            {games.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>

        {/* Status filter */}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">{en.lobby.filterStatus}</span>
          <select
            value={filters.status ?? ''}
            onChange={handleStatusChange}
            className="bg-slate-700 border border-slate-600 text-white text-sm rounded-md px-3 py-1.5"
            aria-label={en.aria.filterByStatus}
          >
            <option value="">{en.lobby.filterAll}</option>
            <option value="waiting">{en.lobby.roomStatus.waiting}</option>
            <option value="in-progress">{en.lobby.roomStatus['in-progress']}</option>
          </select>
        </label>

        {/* Has space */}
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.hasSpace === true}
            onChange={handleHasSpaceChange}
            className="rounded"
          />
          {en.lobby.filterOpenSeats}
        </label>

        {/* Async mode */}
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.asyncMode === true}
            onChange={handleAsyncChange}
            className="rounded"
          />
          {en.lobby.filterAsyncOnly}
        </label>
      </div>
    </aside>
  );
}
