/**
 * RoomBrowserModal — lists rooms for a specific game.
 * Allows joining an existing room or creating a new one.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/shared/Modal';
import { CreateRoomModal } from './CreateRoomModal';
import { getRooms } from '@/api/rooms.api';
import type { GameCatalogEntry } from '@shared/admin';
import type { Room } from '@shared/rooms';
import en from '@/i18n/en.json';
import { logger } from '@/utils/logger';
import { pluralise } from '@/utils/formatScore';

interface RoomBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: GameCatalogEntry;
}

export function RoomBrowserModal({ isOpen, onClose, game }: RoomBrowserModalProps) {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['rooms', { gameId: game.id }],
    queryFn: () => getRooms({ gameId: game.id, status: 'waiting', hasSpace: true }),
    enabled: isOpen,
    staleTime: 10_000,
  });

  const handleJoin = (room: Room) => {
    logger.debug('RoomBrowserModal: join room', { roomId: room.id });
    onClose();
    navigate(`/table/${room.id}`);
  };

  const handleRoomCreated = (roomId: string) => {
    onClose();
    navigate(`/table/${roomId}`);
  };

  if (showCreate) {
    return (
      <CreateRoomModal
        isOpen
        onClose={() => setShowCreate(false)}
        game={game}
        onRoomCreated={handleRoomCreated}
      />
    );
  }

  const rooms = data?.rooms ?? [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${en.rooms.browseTitle}: ${game.name}`}
      className="max-w-lg"
    >
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-slate-400">
          {pluralise(rooms.length, {
            one: en.rooms.roomsAvailable,
            other: en.rooms.roomsAvailablePlural,
          })}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="text-xs text-slate-400 hover:text-white underline"
          >
            {en.rooms.refresh}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md"
          >
            {en.lobby.createRoom}
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="text-slate-400 text-sm text-center py-4">{en.app.loading}</p>
      )}

      {!isLoading && rooms.length === 0 && (
        <p className="text-slate-400 text-sm text-center py-4">{en.lobby.noRooms}</p>
      )}

      <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto overscroll-contain">
        {rooms.map(room => {
          const clockLabel =
            room.settings.asyncMode && room.settings.turnTimerSeconds
              ? en.rooms.turnClockBadge.replace(
                  '{duration}',
                  room.settings.turnTimerSeconds >= 259200
                    ? en.rooms.timer72h
                    : room.settings.turnTimerSeconds >= 172800
                    ? en.rooms.timer48h
                    : en.rooms.timer24h,
                )
              : null;
          return (
          <li
            key={room.id}
            className="flex items-center justify-between bg-slate-700 rounded-md px-4 py-3"
          >
            <div>
              <p className="text-white text-sm font-medium">
                {room.name ?? `Room ${room.id.slice(0, 8)}`}
              </p>
              <p className="text-slate-400 text-xs">
                {room.players.length} / {room.settings.maxPlayers} players
                {clockLabel ? (
                  <span className="ml-2 text-indigo-400" aria-label={clockLabel}>
                    {clockLabel}
                  </span>
                ) : !room.settings.asyncMode ? (
                  <span className="ml-2 text-rose-400" aria-label={en.rooms.liveBadgeTooltip}>
                    {en.rooms.liveBadge}
                  </span>
                ) : null}
              </p>
            </div>
            <button
              onClick={() => handleJoin(room)}
              className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md"
            >
              {en.lobby.joinRoom}
            </button>
          </li>
          );
        })}
      </ul>
    </Modal>
  );
}
