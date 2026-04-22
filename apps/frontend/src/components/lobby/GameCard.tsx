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
      className={[
        'group relative flex flex-col gap-3 p-4 sm:p-5',
        'bg-paper-raised/60 rounded-lg border border-hairline/60',
        'transition-colors duration-200',
        'hover:border-ochre/60 hover:bg-paper-raised',
        'focus-within:border-ochre',
      ].join(' ')}
      aria-label={game.name}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-semibold text-lg text-ink leading-tight break-words hyphens-auto">
            {game.name}
          </h3>
          <p className="text-whisper text-xs mt-1 uppercase tracking-wider">{game.category}</p>
        </div>
        {/* Flag the exception, not the default. Most games are
            "play at your pace" (async); strictly real-time games
            (War, Spit) get a badge so players know what they're in for. */}
        {!game.supportsAsync && (
          <span
            className="shrink-0 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-burgundy bg-paper px-2 py-0.5 rounded-full border border-hairline/80"
            title={en.rooms.liveBadgeTooltip}
            aria-label={en.rooms.liveBadgeTooltip}
          >
            {en.rooms.liveBadge}
          </span>
        )}
      </header>

      <div className="flex items-center gap-2 text-whisper text-xs">
        <span>{playerRange}</span>
        {game.activeRoomCount > 0 && (
          <>
            <span aria-hidden className="text-hairline">·</span>
            <span className="text-sage font-medium">
              {en.lobby.activeRooms.replace('{count}', String(game.activeRoomCount))}
            </span>
          </>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => onBrowseRooms(game)}
          className={[
            'w-full min-h-[44px] px-4 py-2.5 rounded-md',
            'text-sm font-medium whitespace-nowrap',
            'bg-paper border border-hairline text-ink',
            'hover:border-ochre hover:bg-paper-raised transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
          ].join(' ')}
          aria-label={en.aria.browseRoomsFor.replace('{game}', game.name)}
        >
          {en.lobby.browseRooms}
        </button>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className={[
            'w-full min-h-[44px] px-4 py-2.5 rounded-md',
            'text-sm font-medium whitespace-nowrap',
            'bg-ochre text-accent-fg border border-ochre',
            'hover:bg-ochre-hi hover:border-ochre-hi transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
          ].join(' ')}
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
