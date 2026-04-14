/**
 * LeaderboardManager — per-game recalculate and reset monthly leaderboard.
 * POST /admin/leaderboards/:gameId/recalculate
 * DELETE /admin/leaderboards/:gameId/monthly (with confirmation)
 * SPEC.md §22 Story 11.5
 */
import React, { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { recalculateLeaderboard, resetMonthlyLeaderboard } from '@/api/admin.api';
import { Modal } from '@/components/shared/Modal';
import { useToast } from '@/components/shared/Toast';
import { logger } from '@/utils/logger';
import en from '@/i18n/en.json';

/** Game catalog — all 15 games. SPEC.md §2.2 */
const GAME_CATALOG = [
  { id: 'phase10',     name: 'Phase 10' },
  { id: 'rummy',       name: 'Rummy' },
  { id: 'ginrummy',    name: 'Gin Rummy' },
  { id: 'canasta',     name: 'Canasta' },
  { id: 'cribbage',    name: 'Cribbage' },
  { id: 'spades',      name: 'Spades' },
  { id: 'hearts',      name: 'Hearts' },
  { id: 'euchre',      name: 'Euchre' },
  { id: 'whist',       name: 'Whist' },
  { id: 'ohhell',      name: 'Oh Hell!' },
  { id: 'gofish',      name: 'Go Fish' },
  { id: 'crazyeights', name: 'Crazy Eights' },
  { id: 'war',         name: 'War' },
  { id: 'spit',        name: 'Spit / Speed' },
  { id: 'idiot',       name: 'Idiot / Shithead' },
] as const;

export function LeaderboardManager() {
  const { toast } = useToast();
  const [confirmResetGameId, setConfirmResetGameId] = useState<string | null>(null);

  const confirmResetGameName =
    GAME_CATALOG.find(g => g.id === confirmResetGameId)?.name ?? '';

  const recalcMutation = useMutation({
    mutationFn: (gameId: string) => recalculateLeaderboard(gameId),
    onSuccess: (_data, gameId) => {
      const gameName = GAME_CATALOG.find(g => g.id === gameId)?.name ?? gameId;
      logger.info('LeaderboardManager: recalculated', { gameId });
      toast(en.admin.recalculateSuccess.replace('{game}', gameName), 'success');
    },
    onError: (err) => {
      logger.error('LeaderboardManager: recalculate failed', { err });
      toast(en.app.error, 'error');
    },
  });

  const resetMutation = useMutation({
    mutationFn: (gameId: string) => resetMonthlyLeaderboard(gameId),
    onSuccess: (_data, gameId) => {
      const gameName = GAME_CATALOG.find(g => g.id === gameId)?.name ?? gameId;
      logger.info('LeaderboardManager: reset monthly', { gameId });
      toast(en.admin.resetSuccess.replace('{game}', gameName), 'success');
      setConfirmResetGameId(null);
    },
    onError: (err) => {
      logger.error('LeaderboardManager: reset failed', { err });
      toast(en.app.error, 'error');
      setConfirmResetGameId(null);
    },
  });

  const handleConfirmReset = useCallback(() => {
    if (confirmResetGameId) {
      resetMutation.mutate(confirmResetGameId);
    }
  }, [confirmResetGameId, resetMutation]);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700">
              <th className="pb-2 pr-4 text-left">{en.lobby.filterGame}</th>
              <th className="pb-2 pr-4 text-right">{en.admin.recalculate}</th>
              <th className="pb-2 text-right">{en.admin.resetMonthly}</th>
            </tr>
          </thead>
          <tbody>
            {GAME_CATALOG.map(game => (
              <tr key={game.id} className="border-b border-slate-700/50">
                <td className="py-2 pr-4 text-white">{game.name}</td>
                <td className="py-2 pr-4 text-right">
                  <button
                    onClick={() => recalcMutation.mutate(game.id)}
                    disabled={recalcMutation.isPending}
                    aria-label={`${en.admin.recalculate} ${game.name}`}
                    className="text-xs bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors"
                  >
                    {en.admin.recalculate}
                  </button>
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => setConfirmResetGameId(game.id)}
                    disabled={resetMutation.isPending}
                    aria-label={`${en.admin.resetMonthly} ${game.name}`}
                    className="text-xs bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors"
                  >
                    {en.admin.resetMonthly}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmation modal for reset */}
      <Modal
        isOpen={confirmResetGameId !== null}
        onClose={() => setConfirmResetGameId(null)}
        title={en.admin.resetMonthly}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            {en.admin.confirmReset.replace('{game}', confirmResetGameName)}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmResetGameId(null)}
              className="text-sm text-slate-400 hover:text-white px-3 py-2 rounded transition-colors"
            >
              {en.rooms.cancel}
            </button>
            <button
              onClick={handleConfirmReset}
              disabled={resetMutation.isPending}
              className="text-sm bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded transition-colors"
            >
              {en.admin.confirm}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
