/**
 * GameCatalogManager — list all 15 games with enable/disable toggle.
 * PATCH /admin/games/:id to toggle.
 * SPEC.md §22 Story 11.4
 */
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { updateGame } from '@/api/admin.api';
import { useToast } from '@/components/shared/Toast';
import { logger } from '@/utils/logger';
import type { GameCatalogEntry } from '@shared/admin';
import en from '@/i18n/en.json';

export function GameCatalogManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: games = [], isLoading } = useQuery<GameCatalogEntry[]>({
    queryKey: ['admin', 'games'],
    queryFn: () => apiFetch<GameCatalogEntry[]>('/games'),
    staleTime: 30 * 1000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateGame(id, enabled),
    onSuccess: (updatedGame) => {
      logger.info('GameCatalogManager: toggled game', {
        gameId: updatedGame.id,
        enabled: updatedGame.enabled,
      });
      toast(
        updatedGame.enabled
          ? en.admin.gameEnabled.replace('{name}', updatedGame.name)
          : en.admin.gameDisabled.replace('{name}', updatedGame.name),
        'success',
      );
      void queryClient.invalidateQueries({ queryKey: ['admin', 'games'] });
    },
    onError: (err) => {
      logger.error('GameCatalogManager: toggle failed', { err });
      toast(en.app.error, 'error');
    },
  });

  if (isLoading) {
    return <p className="text-slate-400 text-sm">{en.app.loading}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700">
            <th className="pb-2 pr-4 text-left">{en.lobby.filterGame}</th>
            <th className="pb-2 pr-4 text-left">Category</th>
            <th className="pb-2 pr-4 text-right">{en.admin.activeRoomsCount}</th>
            <th className="pb-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {games.map(game => (
            <tr key={game.id} className="border-b border-slate-700/50">
              <td className="py-2 pr-4">
                <span className="text-white font-medium">{game.name}</span>
              </td>
              <td className="py-2 pr-4 text-slate-400 text-xs">{game.category}</td>
              <td className="py-2 pr-4 text-right text-slate-300">{game.activeRoomCount}</td>
              <td className="py-2 text-right">
                <button
                  onClick={() =>
                    toggleMutation.mutate({ id: game.id, enabled: !game.enabled })
                  }
                  disabled={toggleMutation.isPending}
                  aria-label={`${game.enabled ? en.admin.disableGame : en.admin.enableGame} ${game.name}`}
                  className={`text-xs font-medium px-3 py-1 rounded transition-colors disabled:opacity-50 ${
                    game.enabled
                      ? 'bg-red-800 hover:bg-red-700 text-white'
                      : 'bg-green-800 hover:bg-green-700 text-white'
                  }`}
                >
                  {game.enabled ? en.admin.disableGame : en.admin.enableGame}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
