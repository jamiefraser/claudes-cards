/**
 * useGameState — subscribes to game socket events and keeps gameStore in sync.
 * SPEC.md §24
 */
import { useEffect } from 'react';
import { getGameSocket } from './useSocket';
import { useGameStore } from '@/store/gameStore';
import { logger } from '@/utils/logger';
import type { GameStateSyncPayload, GameStateDeltaPayload } from '@shared/socket';
import type { BotActivatedPayload, BotYieldedPayload } from '@shared/bot';

/**
 * Subscribe to game socket events for the given roomId.
 * Must be called within a component rendered inside the game table.
 */
export function useGameState(roomId: string | null): void {
  const applySync = useGameStore(s => s.applySync);
  const applyDelta = useGameStore(s => s.applyDelta);
  const setBotActive = useGameStore(s => s.setBotActive);

  useEffect(() => {
    if (!roomId) return;

    const socket = getGameSocket();

    const onSync = (payload: GameStateSyncPayload) => {
      if (!payload.state || payload.state.roomId !== roomId) return;
      logger.debug('useGameState: game_state_sync', { version: payload.state.version });
      applySync(payload.state);
    };

    const onDelta = (payload: GameStateDeltaPayload) => {
      if (!payload.delta || payload.delta.roomId !== roomId) return;
      const delta = payload.delta;
      const local = useGameStore.getState().gameState;
      // Detect a dropped earlier delta before applyDelta silently skips.
      // We compare here (not only in the store) because we need to emit
      // request_resync — the store is pure state, it doesn't own the
      // socket. SPEC.md §22.
      if (
        local &&
        typeof delta.prevVersion === 'number' &&
        delta.prevVersion !== local.version
      ) {
        logger.warn('useGameState: delta version gap — requesting resync', {
          localVersion: local.version,
          deltaPrevVersion: delta.prevVersion,
          deltaVersion: delta.version,
        });
        socket.emit('request_resync', { roomId, currentVersion: local.version });
        return;
      }
      logger.debug('useGameState: game_state_delta', { version: delta.version });
      applyDelta(delta);
    };

    // NOTE: chat_message is handled by TableChat's own useEffect.
    // Don't subscribe here too — would cause duplicate messages.

    const onBotActivated = (payload: BotActivatedPayload) => {
      logger.info('useGameState: bot_activated', { playerId: payload.playerId });
      setBotActive(payload.playerId, true);
    };

    const onBotYielded = (payload: BotYieldedPayload) => {
      logger.info('useGameState: bot_yielded', { playerId: payload.playerId });
      setBotActive(payload.playerId, false);
    };

    socket.on('game_state_sync', onSync);
    socket.on('game_state_delta', onDelta);
    socket.on('bot_activated', onBotActivated);
    socket.on('bot_yielded', onBotYielded);

    return () => {
      socket.off('game_state_sync', onSync);
      socket.off('game_state_delta', onDelta);
      socket.off('bot_activated', onBotActivated);
      socket.off('bot_yielded', onBotYielded);
    };
  }, [roomId, applySync, applyDelta, setBotActive]);
}
