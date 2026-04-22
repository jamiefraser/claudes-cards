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

  const visibleGames = useMemo(() => {
    let list = games.filter((g) => g.enabled);
    if (filters.gameId) {
      list = list.filter((g) => g.id === filters.gameId);
    }
    if (filters.asyncMode) {
      list = list.filter((g) => g.supportsAsync);
    }
    if (filters.hasSpace) {
      list = list.filter((g) => g.activeRoomCount > 0);
    }
    return list;
  }, [games, filters]);

  return (
    <section
      aria-label={en.lobby.gameBrowserTitle}
      className="flex flex-col md:grid md:grid-cols-[14rem_1fr] md:gap-6 min-w-0"
    >
      <FilterSidebar games={games.filter((g) => g.enabled)} />

      <div className="min-w-0 mt-4 md:mt-0">
        <header className="flex items-baseline justify-between mb-4 md:mb-5">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-ink">
            {en.lobby.gameBrowserTitle}
          </h2>
          <span className="text-xs text-whisper font-mono hidden sm:inline" aria-live="polite">
            {visibleGames.length} {visibleGames.length === 1 ? 'game' : 'games'}
          </span>
        </header>

        {/* Hairline rule — the Le Salon signature under section heads. */}
        <div aria-hidden className="h-px bg-hairline/70 mb-5 md:mb-6" />

        {isLoading && <p className="text-whisper">{en.app.loading}</p>}

        {!isLoading && visibleGames.length === 0 && (
          <p className="text-whisper">{en.lobby.noGames}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
