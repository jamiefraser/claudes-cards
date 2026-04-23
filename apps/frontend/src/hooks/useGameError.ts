/**
 * useGameError — subscribes to `game_error` socket events and surfaces them
 * as toast notifications during active play.
 *
 * Mirrors the pattern of useGameState.ts. The WaitingRoom has its own
 * `game_error` handler (WaitingRoom.tsx:117-126); this hook covers the
 * GameTable context where actions can fail (invalid melds, under-threshold
 * initial melds, illegal pickups, etc.).
 *
 * SPEC.md §24 — game_error event. CLAUDE.md rule 7 — logger, not console.
 */
import { useEffect } from 'react';
import { getGameSocket } from './useSocket';
import { useToast } from '@/components/shared/Toast';
import { logger } from '@/utils/logger';
import type { GameErrorPayload } from '@shared/socket';
import en from '@/i18n/en.json';

/**
 * Subscribe to `game_error` events for the active game and route them to
 * the toast provider.
 *
 * @param roomId - The current room ID, or null if not in a room.
 */
export function useGameError(roomId: string | null): void {
  const { toast } = useToast();

  useEffect(() => {
    if (!roomId) return;

    const socket = getGameSocket();

    const onGameError = (payload: GameErrorPayload) => {
      const message = payload.message || en.error.generic;
      logger.warn('useGameError: game_error received', {
        code: payload.code,
        message,
        roomId,
      });
      toast(message, 'error');
    };

    socket.on('game_error', onGameError);

    return () => {
      socket.off('game_error', onGameError);
    };
  }, [roomId, toast]);
}
