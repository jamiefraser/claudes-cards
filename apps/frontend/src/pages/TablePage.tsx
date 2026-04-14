/**
 * TablePage — renders the waiting room OR the active game table
 * depending on whether the game has started yet.
 * SPEC.md §6, §15
 *
 * Flow:
 * 1. Mount → socket emits join_room
 * 2. Server replies with game_state_sync ({ state: GameState | null })
 *    - state === null: game has not started → render <WaitingRoom>
 *    - state !== null: game is in progress → render <GameTable>
 * 3. WaitingRoom emits start_game; server broadcasts game_state_sync with full state;
 *    we transition to <GameTable> automatically.
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getGameSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/store/gameStore';
import { GameTable } from '@/components/table/GameTable';
import { WaitingRoom } from '@/components/table/WaitingRoom';
import { logger } from '@/utils/logger';
import type { JoinRoomPayload, GameStateSyncPayload } from '@shared/socket';

type Phase = 'joining' | 'waiting' | 'playing';

export function TablePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('joining');
  const applySync = useGameStore((s) => s.applySync);
  const setConnectionStatus = useGameStore((s) => s.setConnectionStatus);

  useEffect(() => {
    if (!roomId) {
      logger.warn('TablePage: no roomId in params');
      navigate('/lobby');
      return;
    }

    const socket = getGameSocket();

    const joinPayload: JoinRoomPayload = { roomId };
    socket.emit('join_room', joinPayload);
    logger.info('TablePage: join_room emitted', { roomId });

    const onSync = (payload: GameStateSyncPayload) => {
      if (!payload.state) {
        // Game has not started yet — render the waiting room.
        logger.info('TablePage: sync with null state → waiting room');
        setPhase('waiting');
        return;
      }
      if (payload.state.roomId !== roomId) {
        logger.warn('TablePage: ignoring sync for wrong roomId', {
          got: payload.state.roomId,
          expected: roomId,
        });
        return;
      }
      logger.info('TablePage: game_state_sync received', {
        version: payload.state.version,
      });
      applySync(payload.state);
      setPhase('playing');
    };

    const onConnect = () => {
      setConnectionStatus('connected');
      socket.emit('join_room', { roomId } satisfies JoinRoomPayload);
    };

    const onDisconnect = () => {
      setConnectionStatus('disconnected');
    };

    socket.on('game_state_sync', onSync);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.emit('leave_room', { roomId });
      logger.info('TablePage: leave_room emitted', { roomId });
      socket.off('game_state_sync', onSync);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [roomId, navigate, applySync, setConnectionStatus]);

  if (!roomId) {
    return null;
  }

  if (phase === 'waiting') {
    return <WaitingRoom roomId={roomId} />;
  }

  if (phase === 'playing') {
    return <GameTable roomId={roomId} />;
  }

  // Joining — briefly shown before the first sync arrives.
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-4">
      <p className="text-slate-400 mb-4">Loading…</p>
      <button
        onClick={() => navigate('/lobby')}
        className="text-indigo-400 hover:text-indigo-300 underline text-sm"
      >
        Back to lobby
      </button>
    </main>
  );
}
