/**
 * usePresence — Sends a heartbeat to keep the player's presence alive in Redis.
 * SPEC.md §5 — presence:player:{playerId} TTL 30s.
 */
import { useEffect, useRef } from 'react';
import { getLobbySocket } from './useSocket';
import { logger } from '@/utils/logger';

const HEARTBEAT_INTERVAL_MS = 20_000; // 20s — well within the 30s Redis TTL

/**
 * Emits a presence heartbeat every 20 seconds while the component is mounted.
 * Should be mounted once at the top of the authenticated layout.
 */
export function usePresence(): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const socket = getLobbySocket();

    const sendHeartbeat = () => {
      if (socket.connected) {
        socket.emit('presence_heartbeat');
        logger.debug('usePresence: heartbeat sent');
      }
    };

    // Send immediately on mount
    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);
}
