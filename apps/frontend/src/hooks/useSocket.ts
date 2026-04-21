/**
 * useSocket — Socket.io-client connection manager.
 * Manages connections to /lobby and /game namespaces.
 * Exponential backoff on disconnect: 1s, 2s, 4s, 8s, max 30s.
 * Emits rejoin_room on reconnection when a roomId is stored.
 * Sets connectionStatus in gameStore: connected / reconnecting / disconnected.
 * SPEC.md §24, §4, §20 Story 9.1–9.3
 */
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { logger } from '@/utils/logger';
import { useGameStore } from '@/store/gameStore';
import { subscribeToTokenChanges } from '@/auth/tokenRefresh';

// Empty string = use current origin; nginx proxies /socket.io to socket-service.
// In dev, vite.config.ts proxy forwards /socket.io to http://localhost:3002.
const SOCKET_URL = (import.meta.env?.VITE_SOCKET_URL as string | undefined) ?? '';
const TOKEN_KEY = 'auth_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

let lobbySocket: Socket | null = null;
let gameSocket: Socket | null = null;

/** Connect to the /lobby namespace. Returns the socket instance. */
export function getLobbySocket(): Socket {
  if (!lobbySocket || !lobbySocket.connected) {
    const token = getToken();
    lobbySocket = io(`${SOCKET_URL}/lobby`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      // Exponential backoff: starts at 1s, doubles, max 30s (SPEC §20)
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0,
    });
    lobbySocket.on('connect', () => {
      logger.info('Lobby socket connected', { id: lobbySocket?.id });
    });
    lobbySocket.on('disconnect', (reason) => {
      logger.warn('Lobby socket disconnected', { reason });
    });
    lobbySocket.on('connect_error', (err) => {
      logger.error('Lobby socket connect_error', { message: err.message });
    });
  }
  return lobbySocket;
}

/** Connect to the /game namespace. Returns the socket instance. */
export function getGameSocket(): Socket {
  if (!gameSocket || !gameSocket.connected) {
    const token = getToken();
    gameSocket = io(`${SOCKET_URL}/game`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      // Exponential backoff: starts at 1s, doubles, max 30s (SPEC §20)
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0,
    });

    gameSocket.on('connect', () => {
      logger.info('Game socket connected', { id: gameSocket?.id });
      useGameStore.getState().setConnectionStatus('connected');

      // Rejoin room on reconnection — SPEC §20 Story 9.2
      const room = useGameStore.getState().room;
      if (room?.id) {
        logger.info('Game socket reconnected: emitting rejoin_room', { roomId: room.id });
        gameSocket!.emit('rejoin_room', { roomId: room.id });
      }
    });

    gameSocket.on('disconnect', (reason) => {
      logger.warn('Game socket disconnected', { reason });
      // Only set disconnected for server-initiated disconnects;
      // socket.io will set reconnecting on its own reconnect attempt events.
      if (reason === 'io server disconnect') {
        useGameStore.getState().setConnectionStatus('disconnected');
      } else {
        useGameStore.getState().setConnectionStatus('reconnecting');
      }
    });

    gameSocket.on('reconnect_attempt', () => {
      logger.info('Game socket reconnect_attempt');
      useGameStore.getState().setConnectionStatus('reconnecting');
    });

    gameSocket.on('reconnect_failed', () => {
      logger.error('Game socket reconnect_failed — all attempts exhausted');
      useGameStore.getState().setConnectionStatus('disconnected');
    });

    gameSocket.on('connect_error', (err) => {
      logger.error('Game socket connect_error', { message: err.message });
      useGameStore.getState().setConnectionStatus('reconnecting');
    });
  }
  return gameSocket;
}

/** Disconnect both sockets (e.g., on logout). */
export function disconnectAllSockets(): void {
  if (lobbySocket) {
    lobbySocket.disconnect();
    lobbySocket = null;
  }
  if (gameSocket) {
    gameSocket.disconnect();
    gameSocket = null;
  }
  logger.info('All sockets disconnected');
}

/**
 * Force open sockets to reconnect with the latest auth token. Called by
 * the token-refresh subscription after a successful refresh — the auth
 * payload is sent in the Socket.io handshake, so the only way to update
 * it is to drop and reopen the connection. The next call to
 * getLobbySocket / getGameSocket re-creates the connection lazily and
 * picks up the new token via getToken() at handshake time.
 */
export function reconnectSocketsWithFreshToken(): void {
  if (lobbySocket) {
    logger.info('useSocket: reconnecting lobby socket with fresh token');
    lobbySocket.disconnect();
    lobbySocket = null;
  }
  if (gameSocket) {
    logger.info('useSocket: reconnecting game socket with fresh token');
    gameSocket.disconnect();
    gameSocket = null;
  }
}

// Subscribe at module load so any successful refresh — proactive or
// reactive (apiFetch 401 → refresh) — triggers a socket reconnect. Avoids
// having to remember to wire this up wherever sockets are used.
subscribeToTokenChanges(() => {
  reconnectSocketsWithFreshToken();
});

/**
 * React hook: ensures the lobby socket is connected for the lifetime of the component.
 * Returns the lobby socket instance.
 */
export function useLobbySocket(): Socket {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = getLobbySocket();
    return () => {
      // We don't disconnect here — lobby socket persists across page navigation
    };
  }, []);

  return getLobbySocket();
}

/**
 * React hook: ensures the game socket is connected for the lifetime of the component.
 * Returns the game socket instance.
 */
export function useGameSocket(): Socket {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = getGameSocket();
    return () => {
      // Connection managed globally; component teardown doesn't disconnect
    };
  }, []);

  return getGameSocket();
}
