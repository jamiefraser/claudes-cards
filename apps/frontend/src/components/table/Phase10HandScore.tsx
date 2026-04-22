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
import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

  // Esc dismisses by acking (same affordance as the button). Never dismisses
  // silently — this is a consent modal, not a popover.
  useEffect(() => {
    if (haveIAcked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleAck();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [haveIAcked, handleAck]);

  // Auto-focus the primary button when the modal opens so keyboard users land
  // on the ack target immediately.
  const ackButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!haveIAcked) ackButtonRef.current?.focus();
  }, [haveIAcked]);

  return createPortal(
    <div
      role="dialog"
      aria-labelledby="phase10-hand-score-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="absolute inset-0 bg-[rgb(29_24_18_/_0.55)] backdrop-blur-sm animate-seat-in"
        aria-hidden
      />
      <div
        className={[
          'relative w-full max-w-lg',
          'bg-paper-raised border border-hairline/60 rounded-2xl shadow-float',
          'p-5 sm:p-7',
          'animate-[seat-in_320ms_ease-out_both]',
          'max-h-[90vh] overflow-y-auto overscroll-contain',
        ].join(' ')}
      >
        <div className="text-center mb-5">
          <p className="text-xs uppercase tracking-[0.25em] text-ochre/80">
            Hand complete
          </p>
          <h2
            id="phase10-hand-score-title"
            className="font-display text-2xl sm:text-3xl mt-1 text-ink text-balance"
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
                  'bg-paper/70 border border-hairline/70',
                  isWinner ? 'ring-1 ring-ochre/70' : '',
                ].join(' ')}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={[
                      'w-2 h-2 rounded-full flex-shrink-0',
                      acked ? 'bg-sage' : 'bg-whisper/60',
                    ].join(' ')}
                    title={acked ? 'Ready for next hand' : 'Waiting…'}
                    aria-hidden
                  />
                  <span className="font-display text-ink truncate">
                    {p.displayName}
                  </span>
                  {isWinner && (
                    <span className="text-[0.65rem] uppercase tracking-wider text-ochre px-1.5 py-0.5 rounded-full bg-ochre/15">
                      Winner
                    </span>
                  )}
                  <span className="text-xs text-whisper flex-shrink-0">
                    Phase {p.currentPhase ?? 1}
                    {p.phaseLaidDown ? ' ✓' : ''}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 flex-shrink-0">
                  <span
                    className={[
                      'font-mono text-sm tabular-nums',
                      delta === 0 ? 'text-sage' : 'text-burgundy',
                    ].join(' ')}
                    aria-label={`Points this hand: ${delta}`}
                  >
                    {delta === 0 ? '±0' : `+${delta}`}
                  </span>
                  <span className="font-display text-ochre tabular-nums text-lg">
                    {p.score}
                  </span>
                  <span className="text-[0.6rem] uppercase tracking-wider text-whisper">
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
                  'bg-paper-deep/60 text-ink-soft border border-hairline',
                  'cursor-default',
                ].join(' ')}
              >
                <span className="truncate inline-block max-w-full align-middle">
                  Waiting for{' '}
                  {waitingOnHumans.length > 0
                    ? waitingOnHumans.map((p) => p.displayName).join(', ')
                    : 'the next deal…'}
                </span>
              </button>
              <p className="text-xs text-whisper text-center">
                The next hand starts as soon as everyone&rsquo;s ready.
              </p>
            </>
          ) : (
            <button
              ref={ackButtonRef}
              type="button"
              onClick={handleAck}
              className={[
                'w-full px-5 py-3 min-h-[48px] rounded-full',
                'font-display text-sm tracking-wide',
                'bg-gradient-to-b from-ochre-hi to-ochre text-accent-fg font-semibold',
                'shadow-[inset_0_1px_0_rgb(var(--paper)_/_0.45),0_6px_16px_-6px_rgb(var(--ochre)_/_0.55)]',
                'hover:brightness-105 active:translate-y-[1px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
                'transition-[transform,box-shadow,filter] duration-150',
              ].join(' ')}
            >
              Ready for next hand
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
