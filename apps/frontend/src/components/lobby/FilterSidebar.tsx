/**
 * FilterSidebar — filter panel for the game browser.
 * Allows filtering by game, status, and player availability.
 *
 * Collapses to a toggle button on mobile so it doesn't eat the top
 * of the viewport before the user reaches the game grid.
 */
import React, { useState } from 'react';
import type { RoomListQuery } from '@shared/rooms';
import type { GameCatalogEntry } from '@shared/admin';
import { useLobbyStore } from '@/store/lobbyStore';
import en from '@/i18n/en.json';

interface FilterSidebarProps {
  games: GameCatalogEntry[];
}

export function FilterSidebar({ games }: FilterSidebarProps) {
  const { filters, setFilters } = useLobbyStore();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const activeCount =
    (filters.gameId ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.hasSpace ? 1 : 0) +
    (filters.asyncMode ? 1 : 0);

  const panel = (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-whisper uppercase tracking-wider">{en.lobby.filterGame}</span>
        <select
          value={filters.gameId ?? ''}
          onChange={handleGameChange}
          className="bg-paper border border-hairline text-ink text-sm rounded-md px-3 py-2 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi"
          aria-label={en.aria.filterByGame}
        >
          <option value="">{en.lobby.filterAllGames}</option>
          {games.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-whisper uppercase tracking-wider">{en.lobby.filterStatus}</span>
        <select
          value={filters.status ?? ''}
          onChange={handleStatusChange}
          className="bg-paper border border-hairline text-ink text-sm rounded-md px-3 py-2 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi"
          aria-label={en.aria.filterByStatus}
        >
          <option value="">{en.lobby.filterAll}</option>
          <option value="waiting">{en.lobby.roomStatus.waiting}</option>
          <option value="in-progress">{en.lobby.roomStatus['in-progress']}</option>
        </select>
      </label>

      <label className="flex items-center gap-3 text-sm text-ink-soft cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          checked={filters.hasSpace === true}
          onChange={handleHasSpaceChange}
          className="w-4 h-4 accent-ochre"
        />
        {en.lobby.filterOpenSeats}
      </label>

      <label className="flex items-center gap-3 text-sm text-ink-soft cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          checked={filters.asyncMode === true}
          onChange={handleAsyncChange}
          className="w-4 h-4 accent-ochre"
        />
        {en.lobby.filterAsyncOnly}
      </label>
    </div>
  );

  return (
    <aside
      className="w-full md:w-56 md:flex-shrink-0"
      aria-label={en.lobby.filterTitle}
    >
      {/* Mobile: collapsible header */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(v => !v)}
          aria-expanded={mobileOpen}
          aria-controls="lobby-filter-body"
          className="flex items-center justify-between w-full min-h-[44px] px-3 py-2 rounded-md border border-hairline/70 bg-paper-raised/60 text-ink"
        >
          <span className="flex items-center gap-2 text-sm font-medium tracking-wide">
            <span className="text-xs uppercase tracking-[0.18em] text-ochre">
              {en.lobby.filterTitle}
            </span>
            {activeCount > 0 && (
              <span className="text-[0.65rem] px-1.5 py-0.5 rounded-full bg-ochre text-paper font-mono">
                {activeCount}
              </span>
            )}
          </span>
          <span
            aria-hidden
            className={`text-ochre transition-transform duration-200 ${mobileOpen ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </button>
        {mobileOpen && (
          <div id="lobby-filter-body" className="mt-3 animate-seat-in">
            {panel}
          </div>
        )}
      </div>

      {/* Tablet / desktop: always-visible sidebar */}
      <div className="hidden md:block">
        <h2 className="font-display text-sm font-semibold text-ochre uppercase tracking-[0.18em] mb-4">
          {en.lobby.filterTitle}
        </h2>
        {panel}
      </div>
    </aside>
  );
}
