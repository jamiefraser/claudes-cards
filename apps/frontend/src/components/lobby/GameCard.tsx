/**
 * GameCard — displays a single game from the catalog.
 * Clicking "Browse Rooms" opens the RoomBrowserModal.
 */
import React, { useState } from 'react';
import type { GameCatalogEntry } from '@shared/admin';
import en from '@/i18n/en.json';
import { CreateRoomModal } from './CreateRoomModal';

interface GameCardProps {
  game: GameCatalogEntry;
  onBrowseRooms: (game: GameCatalogEntry) => void;
}

export function GameCard({ game, onBrowseRooms }: GameCardProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const playerRange = game.minPlayers === game.maxPlayers
    ? `${game.minPlayers} ${en.lobby.playerLabel}`
    : `${game.minPlayers}–${game.maxPlayers} ${en.lobby.playerLabel}`;

  return (
    <article
      className="bg-slate-800 rounded-lg p-4 flex flex-col gap-3 border border-slate-700 hover:border-indigo-500 transition-colors"
      aria-label={game.name}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-white font-semibold text-base">{game.name}</h3>
          <p className="text-slate-400 text-xs mt-0.5">{game.category}</p>
        </div>
        {game.supportsAsync && (
          <span className="text-xs bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded-full">
            {en.lobby.asyncMode}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-slate-400 text-xs">
        <span>{playerRange}</span>
        {game.activeRoomCount > 0 && (
          <span className="text-green-400">
            {en.lobby.activeRooms.replace('{count}', String(game.activeRoomCount))}
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <button
          onClick={() => onBrowseRooms(game)}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
          aria-label={en.aria.browseRoomsFor.replace('{game}', game.name)}
        >
          {en.lobby.browseRooms}
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
        >
          {en.lobby.createRoom}
        </button>
      </div>

      {createOpen && (
        <CreateRoomModal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          game={game}
        />
      )}
    </article>
  );
}
