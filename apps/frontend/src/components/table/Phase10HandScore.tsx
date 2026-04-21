/**
 * Phase10HandScore — end-of-hand scoring overlay.
 *
 * Shown when the Phase 10 engine transitions to `phase === 'scoring'` after
 * a player goes out. Displays the hand winner, each player's per-hand
 * point contribution, their cumulative totals, and an ACK button. The next
 * hand deals once every seated player (human AND bot) has acked. Bots
 * ack automatically via the strategy; this UI is for humans only.
 *
 * SPEC.md §9.5 and §15 (hand-end flow).
 */
import React, { useCallback } from 'react';
import { getGameSocket } from '@/hooks/useSocket';
import { logger } from '@/utils/logger';
import type { GameActionPayload } from '@shared/socket';

interface Phase10HandScoreProps {
  readonly roomId: string;
  readonly myPlayerId: string | undefined;
  readonly players: ReadonlyArray<{
    playerId: string;
    displayName: string;
    score: number;
    currentPhase?: number;
    phaseLaidDown?: boolean;
    isBot: boolean;
  }>;
  readonly activeBotIds: ReadonlySet<string>;
  readonly handWinnerId: string | undefined;
  readonly handScores: Readonly<Record<string, number>>;
  readonly scoringAcks: ReadonlyArray<string>;
}

export function Phase10HandScore({
  roomId,
  myPlayerId,
  players,
  activeBotIds,
  handWinnerId,
  handScores,
  scoringAcks,
}: Phase10HandScoreProps) {
  const ackedSet = new Set(scoringAcks);
  const haveIAcked = myPlayerId ? ackedSet.has(myPlayerId) : true;

  const waitingOn = players.filter((p) => !ackedSet.has(p.playerId));
  const waitingOnHumans = waitingOn.filter(
    (p) => !p.isBot && !activeBotIds.has(p.playerId),
  );

  const winner = players.find((p) => p.playerId === handWinnerId);
  const sortedByScore = [...players].sort((a, b) => a.score - b.score);

  const handleAck = useCallback(() => {
    if (!myPlayerId) return;
    const socket = getGameSocket();
    socket.emit('game_action', {
      roomId,
      action: { type: 'ack-scoring' },
    } satisfies GameActionPayload);
    logger.debug('Phase10HandScore: ack-scoring', { roomId, myPlayerId });
  }, [roomId, myPlayerId]);

  return (
    <div
      role="dialog"
      aria-labelledby="phase10-hand-score-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="absolute inset-0 bg-night/80 backdrop-blur-sm animate-[seat-in_260ms_ease-out_both]"
        aria-hidden
      />
      <div
        className={[
          'relative w-full max-w-lg',
          'bg-night-raised border border-brass/35 rounded-2xl shadow-float',
          'p-5 sm:p-7',
          'animate-[seat-in_320ms_ease-out_both]',
          'max-h-[90vh] overflow-y-auto',
        ].join(' ')}
      >
        <div className="text-center mb-5">
          <p className="text-xs uppercase tracking-[0.25em] text-brass-bright/70">
            Hand complete
          </p>
          <h2
            id="phase10-hand-score-title"
            className="font-display text-2xl sm:text-3xl mt-1 text-parchment"
          >
            {winner
              ? `${winner.displayName} went out`
              : 'Hand scored'}
          </h2>
        </div>

        <ul className="flex flex-col gap-2 mb-5" role="list">
          {sortedByScore.map((p) => {
            const delta = handScores[p.playerId] ?? 0;
            const isWinner = p.playerId === handWinnerId;
            const acked = ackedSet.has(p.playerId);
            return (
              <li
                key={p.playerId}
                className={[
                  'flex items-center justify-between gap-3',
                  'px-3 py-2.5 rounded-lg',
                  'bg-night/60 border border-brass/15',
                  isWinner ? 'ring-1 ring-brass/60' : '',
                ].join(' ')}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={[
                      'w-2 h-2 rounded-full flex-shrink-0',
                      acked ? 'bg-emerald-400' : 'bg-slate-500',
                    ].join(' ')}
                    title={acked ? 'Ready for next hand' : 'Waiting…'}
                    aria-hidden
                  />
                  <span className="font-display text-parchment truncate">
                    {p.displayName}
                  </span>
                  {isWinner && (
                    <span className="text-[0.65rem] uppercase tracking-wider text-brass-bright px-1.5 py-0.5 rounded-full bg-brass/15">
                      Winner
                    </span>
                  )}
                  <span className="text-xs text-parchment/60 flex-shrink-0">
                    Phase {p.currentPhase ?? 1}
                    {p.phaseLaidDown ? ' ✓' : ''}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 flex-shrink-0">
                  <span
                    className={[
                      'font-mono text-sm tabular-nums',
                      delta === 0 ? 'text-emerald-300' : 'text-rose-300/90',
                    ].join(' ')}
                    aria-label={`Points this hand: ${delta}`}
                  >
                    {delta === 0 ? '±0' : `+${delta}`}
                  </span>
                  <span className="font-display text-brass-bright tabular-nums text-lg">
                    {p.score}
                  </span>
                  <span className="text-[0.6rem] uppercase tracking-wider text-parchment/40">
                    pts
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2">
          {haveIAcked ? (
            <>
              <button
                type="button"
                disabled
                className={[
                  'w-full px-5 py-3 min-h-[48px] rounded-full',
                  'font-display text-sm tracking-wide',
                  'bg-night/70 text-parchment/60 border border-brass/20',
                  'cursor-default',
                ].join(' ')}
              >
                Waiting for{' '}
                {waitingOnHumans.length > 0
                  ? waitingOnHumans.map((p) => p.displayName).join(', ')
                  : 'the next deal…'}
              </button>
              <p className="text-xs text-parchment/50 text-center">
                The next hand starts as soon as everyone's ready.
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={handleAck}
              className={[
                'w-full px-5 py-3 min-h-[48px] rounded-full',
                'font-display text-sm tracking-wide',
                'bg-gradient-to-b from-brass-bright to-brass text-night font-semibold',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_16px_-6px_rgba(200,169,106,0.6)]',
                'hover:brightness-105 active:translate-y-[1px]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary',
                'transition-all duration-150',
              ].join(' ')}
            >
              Ready for next hand
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
