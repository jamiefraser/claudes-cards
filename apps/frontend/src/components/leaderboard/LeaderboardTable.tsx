/**
 * LeaderboardTable — renders a leaderboard for a given game.
 * Props: gameId, period ('monthly' | 'allTime'), scope ('global' | 'friends')
 * Uses useQuery to fetch /leaderboard/:gameId.
 * Subscribes to leaderboard_updated socket event and refetches.
 * Filters out bot entries (isBot defense-in-depth — CLAUDE.md rule 11).
 * SPEC.md §18 Epic 7
 */
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLeaderboard } from '@/api/leaderboard.api';
import { getLobbySocket } from '@/hooks/useSocket';
import { Avatar } from '@/components/shared/Avatar';
import { logger } from '@/utils/logger';
import type { LeaderboardEntry } from '@shared/leaderboard';
import en from '@/i18n/en.json';

interface LeaderboardTableProps {
  gameId: string;
  period: 'monthly' | 'allTime';
  scope: 'global' | 'friends';
}

const PERIOD_MAP: Record<'monthly' | 'allTime', 'monthly' | 'all-time'> = {
  monthly: 'monthly',
  allTime: 'all-time',
};

export function LeaderboardTable({ gameId, period, scope }: LeaderboardTableProps) {
  const [justUpdated, setJustUpdated] = useState(false);

  const queryKey = ['leaderboard', gameId, period, scope] as const;

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      getLeaderboard({
        gameId,
        period: PERIOD_MAP[period],
        friendsOnly: scope === 'friends',
      }),
    staleTime: 30 * 1000,
  });

  // Subscribe to leaderboard_updated socket event
  useEffect(() => {
    // leaderboard_updated is emitted on the /lobby namespace by subscriber.ts
    const socket = getLobbySocket();

    function onLeaderboardUpdated(payload: { gameId: string }) {
      if (payload.gameId === gameId) {
        logger.info('LeaderboardTable: leaderboard_updated event received', { gameId });
        void refetch();
        setJustUpdated(true);
        setTimeout(() => setJustUpdated(false), 3000);
      }
    }

    socket.on('leaderboard_updated', onLeaderboardUpdated);
    return () => {
      socket.off('leaderboard_updated', onLeaderboardUpdated);
    };
  }, [gameId, refetch]);

  // Defense-in-depth: filter out any bot entries (CLAUDE.md rule 11)
  // Bot playerIds are prefixed with 'bot:' per SPEC §9
  const entries: LeaderboardEntry[] = (data?.entries ?? []).filter(
    e => !e.playerId.startsWith('bot:'),
  );

  return (
    <div className="relative">
      {isLoading && (
        <div role="status" aria-label="Loading leaderboard" className="py-2">
          <span aria-hidden="true" className="text-slate-400 text-sm">…</span>
        </div>
      )}
      {justUpdated && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-0 right-0 text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded"
        >
          {en.leaderboard.updateIndicator}
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700">
            <th className="pb-2 pr-4 text-left">{en.leaderboard.rank}</th>
            <th className="pb-2 pr-4 text-left">{en.leaderboard.player}</th>
            <th className="pb-2 pr-4 text-right">{en.leaderboard.wins}</th>
            <th className="pb-2 pr-4 text-right">{en.leaderboard.losses}</th>
            <th className="pb-2 text-right">{en.leaderboard.gamesPlayed}</th>
          </tr>
        </thead>
        <tbody>
          {!isLoading && entries.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="py-6 text-center text-slate-400 text-sm"
              >
                {en.leaderboard.noEntries}
              </td>
            </tr>
          )}
          {entries.map((entry, idx) => (
            <tr
              key={entry.playerId}
              className={`border-b border-slate-700/50 ${
                idx < 3 ? 'font-semibold' : ''
              }`}
            >
              <td className="py-2 pr-4 text-slate-300">
                {idx === 0 && <span className="text-yellow-400">1</span>}
                {idx === 1 && <span className="text-slate-300">2</span>}
                {idx === 2 && <span className="text-amber-600">3</span>}
                {idx > 2 && <span className="text-slate-500">{entry.rank}</span>}
              </td>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2">
                  <Avatar
                    displayName={entry.displayName}
                    avatarUrl={entry.avatarUrl}
                    size="sm"
                  />
                  <span className="text-white">{entry.displayName}</span>
                </div>
              </td>
              <td className="py-2 pr-4 text-right text-green-400">{entry.wins}</td>
              <td className="py-2 pr-4 text-right text-red-400">{entry.losses}</td>
              <td className="py-2 text-right text-slate-300">{entry.gamesPlayed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
