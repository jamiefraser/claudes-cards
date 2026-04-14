/**
 * GameBrowser — shows the available games from the catalog.
 * SPEC.md §14 Epic 3
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GameCard } from './GameCard';
import { RoomBrowserModal } from './RoomBrowserModal';
import { FilterSidebar } from './FilterSidebar';
import { apiFetch } from '@/api/client';
import { useLobbyStore } from '@/store/lobbyStore';
import type { GameCatalogEntry } from '@shared/admin';
import en from '@/i18n/en.json';
import { logger } from '@/utils/logger';

export function GameBrowser() {
  const [selectedGame, setSelectedGame] = useState<GameCatalogEntry | null>(null);
  const filters = useLobbyStore((s) => s.filters);

  const { data: games = [], isLoading } = useQuery({
    queryKey: ['games'],
    queryFn: async () => {
      logger.debug('GameBrowser: fetching games catalog');
      return apiFetch<GameCatalogEntry[]>('/games');
    },
    staleTime: 30_000,
  });

  // Apply filters from the FilterSidebar in real time.
  // - gameId:    show only that specific game (single-card view)
  // - asyncMode: show only games that support async play
  // - hasSpace:  show only games that have at least one active room (proxy for "joinable")
  // - status:    scoped to rooms, not games — ignored here
  const visibleGames = useMemo(() => {
    let list = games.filter((g) => g.enabled);
    if (filters.gameId) {
      list = list.filter((g) => g.id === filters.gameId);
    }
    if (filters.asyncMode) {
      list = list.filter((g) => g.supportsAsync);
    }
    if (filters.hasSpace) {
      // "Open seats" on the game view: games with at least one active room.
      // Someone can join or create a new room; this narrows to games with activity.
      list = list.filter((g) => g.activeRoomCount > 0);
    }
    return list;
  }, [games, filters]);

  return (
    <section aria-label={en.lobby.gameBrowserTitle} className="flex flex-col md:flex-row gap-4 md:gap-6 flex-1 min-w-0">
      <FilterSidebar games={games.filter((g) => g.enabled)} />

      <div className="flex-1 min-w-0">
        <h2 className="text-lg sm:text-xl font-bold text-white mb-4">{en.lobby.gameBrowserTitle}</h2>

        {isLoading && <p className="text-slate-400">{en.app.loading}</p>}

        {!isLoading && visibleGames.length === 0 && (
          <p className="text-slate-400">{en.lobby.noGames}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onBrowseRooms={setSelectedGame}
            />
          ))}
        </div>
      </div>

      {selectedGame && (
        <RoomBrowserModal
          isOpen={selectedGame !== null}
          onClose={() => setSelectedGame(null)}
          game={selectedGame}
        />
      )}
    </section>
  );
}
