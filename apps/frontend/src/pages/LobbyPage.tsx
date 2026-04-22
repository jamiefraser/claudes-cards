/**
 * LobbyPage — main lobby with game browser and friend list.
 * SPEC.md §6, §14
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameBrowser } from '@/components/lobby/GameBrowser';
import { FriendList } from '@/components/social/FriendList';
import { ThemePicker } from '@/components/shared/ThemePicker';
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
  const [friendsOpen, setFriendsOpen] = useState(false);

  usePresence();
  useLobbySocket();

  const { setRooms, upsertRoom, removeRoom } = useLobbyStore();

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

  // Unauthenticated redirect — done in an effect so we don't mutate router
  // state during render (React warning + stale-state races).
  useEffect(() => {
    if (!isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;

  const navButton = (
    label: string,
    onClick: () => void,
    { badge }: { badge?: string } = {},
  ) => (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 min-h-[44px] px-2.5 text-sm text-ink-soft hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi rounded-md"
    >
      {label}
      {badge && (
        <span className="text-[0.65rem] font-mono px-1.5 py-0.5 rounded-full bg-ochre/15 text-ochre">{badge}</span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Top nav — single row, scrolls user chrome on tiny screens. */}
      <header className="sticky top-0 z-20 bg-paper/92 backdrop-blur border-b border-hairline/70">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-3">
          <h1 className="font-display text-lg sm:text-xl font-semibold text-ink tracking-tight leading-none">
            {en.app.title}
          </h1>
          <nav className="flex items-center gap-0.5 sm:gap-2" aria-label="Account menu">
            <div className="hidden md:block">
              <ThemePicker variant="pill" />
            </div>
            <span className="hidden sm:inline text-xs text-whisper font-mono" aria-label="Signed in as">
              {player?.displayName}
            </span>
            {navButton(en.leaderboard.title, () => navigate('/leaderboard'))}
            {navButton(en.settings.title, () => navigate('/settings'))}
            {(player?.role === 'admin' || player?.role === 'moderator') &&
              navButton(en.admin.title, () => navigate('/admin'))}
            {navButton(en.auth.signOut, logout)}
            <button
              onClick={() => setFriendsOpen(v => !v)}
              aria-expanded={friendsOpen}
              aria-controls="lobby-friends-drawer"
              className="md:hidden inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi rounded-md"
            >
              <span aria-hidden className="text-lg">☍</span>
              <span className="sr-only">{en.lobby.friendsDrawerToggle}</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main content. Grid + friends rail on desktop; stacked on mobile. */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 flex flex-col md:grid md:grid-cols-[1fr_18rem] md:gap-6 md:items-start">
        <GameBrowser />

        {/* Desktop: always-visible Friends rail */}
        <div className="hidden md:block md:sticky md:top-[5rem] self-start">
          <FriendList />
        </div>

        {/* Mobile: collapsible Friends drawer triggered from the header */}
        {friendsOpen && (
          <div
            id="lobby-friends-drawer"
            className="md:hidden mt-4 animate-seat-in"
          >
            <FriendList />
          </div>
        )}
      </main>
    </div>
  );
}
