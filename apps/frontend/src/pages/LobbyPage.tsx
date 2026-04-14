/**
 * LobbyPage — main lobby with game browser and friend list.
 * SPEC.md §6, §14
 */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameBrowser } from '@/components/lobby/GameBrowser';
import { FriendList } from '@/components/social/FriendList';
import { useAuth } from '@/auth/useAuth';
import { usePresence } from '@/hooks/usePresence';
import { useLobbySocket, getLobbySocket } from '@/hooks/useSocket';
import { useLobbyStore } from '@/store/lobbyStore';
import en from '@/i18n/en.json';
import { logger } from '@/utils/logger';
import type {
  RoomListPayload,
  RoomUpdatedPayload,
  RoomRemovedPayload,
} from '@shared/socket';

export function LobbyPage() {
  const navigate = useNavigate();
  const { player, isAuthenticated, logout } = useAuth();

  // Presence heartbeat
  usePresence();

  // Ensure lobby socket is connected
  useLobbySocket();

  const { setRooms, upsertRoom, removeRoom } = useLobbyStore();

  // Subscribe to lobby socket events
  useEffect(() => {
    const socket = getLobbySocket();

    const onRoomList = (payload: RoomListPayload) => {
      logger.debug('LobbyPage: room_list', { count: payload.rooms.length });
      setRooms(payload.rooms, payload.total);
    };

    const onRoomUpdated = (payload: RoomUpdatedPayload) => {
      logger.debug('LobbyPage: room_updated', { roomId: payload.room.id });
      upsertRoom(payload.room);
    };

    const onRoomRemoved = (payload: RoomRemovedPayload) => {
      logger.debug('LobbyPage: room_removed', { roomId: payload.roomId });
      removeRoom(payload.roomId);
    };

    socket.on('room_list', onRoomList);
    socket.on('room_updated', onRoomUpdated);
    socket.on('room_removed', onRoomRemoved);

    return () => {
      socket.off('room_list', onRoomList);
      socket.off('room_updated', onRoomUpdated);
      socket.off('room_removed', onRoomRemoved);
    };
  }, [setRooms, upsertRoom, removeRoom]);

  if (!isAuthenticated) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Top nav */}
      <header className="bg-slate-800 border-b border-slate-700 px-3 sm:px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-base sm:text-lg font-bold text-white">{en.app.title}</h1>
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <span className="text-sm text-slate-300 hidden sm:inline">{player?.displayName}</span>
          <button
            onClick={() => navigate('/leaderboard')}
            className="text-sm text-slate-400 hover:text-white py-2 px-2 min-h-[44px] inline-flex items-center"
          >
            {en.leaderboard.title}
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="text-sm text-slate-400 hover:text-white py-2 px-2 min-h-[44px] inline-flex items-center"
          >
            {en.settings.title}
          </button>
          {(player?.role === 'admin' || player?.role === 'moderator') && (
            <button
              onClick={() => navigate('/admin')}
              className="text-sm text-slate-400 hover:text-white py-2 px-2 min-h-[44px] inline-flex items-center"
            >
              {en.admin.title}
            </button>
          )}
          <button
            onClick={logout}
            className="text-sm text-slate-400 hover:text-white py-2 px-2 min-h-[44px] inline-flex items-center"
          >
            {en.auth.signOut}
          </button>
        </div>
      </header>

      {/* Main content — stacks vertically on mobile, side-by-side on md+ */}
      <main className="flex flex-col md:flex-row flex-1 gap-4 md:gap-6 p-3 sm:p-6 md:overflow-hidden">
        <GameBrowser />
        <FriendList />
      </main>
    </div>
  );
}
