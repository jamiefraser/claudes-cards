/**
 * ConnectionBanner — fixed top banner showing socket connection status.
 * Hidden when connected; yellow when reconnecting; red when disconnected.
 * SPEC.md §20 Story 9.1–9.3
 */
import React, { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import en from '@/i18n/en.json';

export function ConnectionBanner() {
  const connectionStatus = useGameStore(s => s.connectionStatus);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Show banner when either the browser reports offline, or the game socket is not connected.
  const offline = !isOnline;
  const isReconnecting = connectionStatus === 'reconnecting';
  const isDisconnected = connectionStatus === 'disconnected' || offline;
  const shouldShow = isReconnecting || isDisconnected;

  if (!shouldShow) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="connection-banner"
      className={`fixed top-0 left-0 right-0 z-[300] flex items-center justify-center py-2 px-4 text-white text-sm font-medium ${
        isReconnecting && !offline ? 'bg-amber-500' : 'bg-red-600'
      }`}
    >
      {offline
        ? en.connection.lost
        : isReconnecting
        ? en.table.reconnecting
        : en.connection.lost}
    </div>
  );
}
