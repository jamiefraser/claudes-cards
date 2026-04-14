/**
 * WaitingRoom — shown when a room exists but the game has not yet started.
 * The host sees a "Start Game" button; everyone else sees a list of joined players.
 *
 * Flow:
 * 1. Players navigate to /table/:roomId (via Create Room or Browse Rooms → Join).
 * 2. Socket joins them to the room; server broadcasts `player_joined`.
 * 3. Host clicks "Start Game".
 * 4. If room not full, BotPickerModal asks about bots.
 * 5. Socket emits `start_game { botCount }`; server initialises engine,
 *    broadcasts `game_state_sync` with the real GameState.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGameSocket } from '@/hooks/useSocket';
import { useAuth } from '@/auth/useAuth';
import { BotPickerModal } from './BotPickerModal';
import { useToast } from '@/components/shared/Toast';
import { logger } from '@/utils/logger';
import { getRoom } from '@/api/rooms.api';
import type { Room } from '@shared/rooms';

interface WaitingRoomProps {
  roomId: string;
}

interface JoinedPlayer {
  playerId: string;
  displayName: string;
}

export function WaitingRoom({ roomId }: WaitingRoomProps) {
  const { player } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [room, setRoom] = useState<Room | null>(null);
  const [joined, setJoined] = useState<JoinedPlayer[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const isHost = !!player && !!room && room.hostId === player.id;

  // Fetch room metadata (host, maxPlayers, minPlayers, gameId) once
  useEffect(() => {
    let cancelled = false;
    getRoom(roomId)
      .then((r) => {
        if (!cancelled) setRoom(r);
      })
      .catch((err) => {
        logger.warn('WaitingRoom: getRoom failed', { err });
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // Seed the joined list with self (the player just socket-joined in TablePage)
  useEffect(() => {
    if (player && !joined.some((j) => j.playerId === player.id)) {
      setJoined((prev) => [
        ...prev,
        { playerId: player.id, displayName: player.displayName },
      ]);
    }
  }, [player, joined]);

  // Subscribe to player_joined / player_left for real-time updates
  useEffect(() => {
    const socket = getGameSocket();

    function onPlayerJoined(payload: { playerId: string; displayName: string }) {
      setJoined((prev) => {
        if (prev.some((j) => j.playerId === payload.playerId)) return prev;
        return [...prev, payload];
      });
    }

    function onGameError(payload: { code: string; message: string }) {
      toast(payload.message ?? 'An error occurred', 'error');
      setStarting(false);
    }

    socket.on('player_joined', onPlayerJoined);
    socket.on('game_error', onGameError);

    return () => {
      socket.off('player_joined', onPlayerJoined);
      socket.off('game_error', onGameError);
    };
  }, [toast]);

  const humanCount = joined.length;
  const maxPlayers = room?.settings.maxPlayers ?? 6;
  const minPlayers = 2; // Most games require ≥2; engine will validate on start.
  const roomIsFull = humanCount >= maxPlayers;

  const handleStartClick = () => {
    if (!isHost || !room || starting) return;
    // If the room is full, start directly.
    // Otherwise prompt for bots. If host is alone, at least one bot is required.
    if (roomIsFull) {
      emitStart(0);
    } else {
      setPickerOpen(true);
    }
  };

  const emitStart = (botCount: number) => {
    setPickerOpen(false);
    setStarting(true);
    const socket = getGameSocket();
    logger.info('WaitingRoom: emitting start_game', { roomId, botCount });
    socket.emit('start_game', { roomId, botCount });
    // Server will respond with game_state_sync; TablePage flips to GameTable automatically.
  };

  if (!room) {
    return (
      <main className="min-h-screen bg-slate-900 p-6 text-white flex items-center justify-center">
        <p className="text-slate-400">…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-900 p-3 sm:p-6 text-white">
      <div className="max-w-xl mx-auto">
        <button
          onClick={() => navigate('/lobby')}
          className="text-indigo-400 hover:text-indigo-300 text-sm mb-4"
        >
          ← Back to lobby
        </button>

        <h1 className="text-2xl font-bold mb-1">{room.name || 'Game Room'}</h1>
        <p className="text-sm text-slate-400 mb-6">
          {room.gameId} — {humanCount} of {maxPlayers} seat{maxPlayers === 1 ? '' : 's'} filled
        </p>

        <section aria-label="Players in room" className="mb-8">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
            Players
          </h2>
          <ul className="flex flex-col gap-2">
            {joined.map((j) => (
              <li
                key={j.playerId}
                className="bg-slate-800 rounded-md px-3 py-2 flex items-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-green-400" aria-hidden="true" />
                <span className="text-white text-sm">{j.displayName}</span>
                {j.playerId === room.hostId && (
                  <span className="ml-auto text-xs text-indigo-300">HOST</span>
                )}
              </li>
            ))}
            {humanCount < maxPlayers &&
              Array.from({ length: maxPlayers - humanCount }).map((_, i) => (
                <li
                  key={`empty-${i}`}
                  className="bg-slate-800/50 border border-dashed border-slate-700 rounded-md px-3 py-2 text-sm text-slate-500"
                >
                  Empty seat
                </li>
              ))}
          </ul>
        </section>

        {isHost ? (
          <button
            type="button"
            onClick={handleStartClick}
            disabled={starting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-md transition-colors disabled:opacity-50"
          >
            {starting ? 'Starting…' : 'Start Game'}
          </button>
        ) : (
          <p className="text-center text-slate-400 text-sm">
            Waiting for the host to start the game…
          </p>
        )}

        <BotPickerModal
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onConfirm={emitStart}
          humanCount={humanCount}
          minPlayers={minPlayers}
          maxPlayers={maxPlayers}
        />
      </div>
    </main>
  );
}
