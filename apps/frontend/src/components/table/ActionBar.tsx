/**
 * ActionBar — bottom action bar for game controls.
 * SPEC.md §15
 */
import React, { useCallback } from 'react';
import { getGameSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/store/gameStore';
import { logger } from '@/utils/logger';
import type { GameActionPayload } from '@shared/socket';
import en from '@/i18n/en.json';

export interface ActionBarProps {
  roomId: string;
  /** Whether it's this player's turn */
  isMyTurn: boolean;
  /** IDs of selected cards */
  selectedCardIds: string[];
  /** Current game id (drives which buttons to show). */
  gameId?: string;
  /** Current cribbage sub-phase, if gameId==='cribbage'. */
  cribbagePhase?: 'discarding' | 'cutting' | 'pegging' | 'counting' | 'ended';
  /** How many more cards the player still owes to the crib (cribbage). */
  cribRemaining?: number;
  /** Cribbage counting sub-step ('hand' or 'crib'), if applicable. */
  countingStep?: 'hand' | 'crib';
  /** PlayerId of the active counter during cribbage counting. */
  currentCountPlayerId?: string;
  /** PlayerId of this round's dealer (cribbage). */
  dealerPlayerId?: string;
  /** This client's own playerId. */
  myPlayerId?: string;
  /** Display name of the active counter (for the waiting message). */
  counterName?: string;
}

export function ActionBar({
  roomId,
  isMyTurn,
  selectedCardIds,
  gameId,
  cribbagePhase,
  cribRemaining = 0,
  countingStep,
  currentCountPlayerId,
  dealerPlayerId,
  myPlayerId,
  counterName = '',
}: ActionBarProps) {
  const clearSelection = useGameStore(s => s.clearSelection);

  const emitAction = useCallback(
    (type: string, cardIds?: string[], payload?: Record<string, unknown>) => {
      const socket = getGameSocket();
      const body: GameActionPayload = {
        roomId,
        action: { type, cardIds, ...(payload ? { payload } : {}) },
      };
      socket.emit('game_action', body);
      logger.debug('ActionBar: emitting game_action', { type, cardIds, payload });
      clearSelection();
    },
    [roomId, clearSelection],
  );

  const isCribbage = gameId === 'cribbage';
  const isDiscardingToCrib = isCribbage && cribbagePhase === 'discarding';
  const isPegging = isCribbage && cribbagePhase === 'pegging';
  const isCounting = isCribbage && cribbagePhase === 'counting';
  // Trick-taking games use a generic "play" action on the selected card.
  // Accept both one-word ('ohhell') and kebab-case ('oh-hell') forms so the
  // UI works whether the DB seed or the engine is the source of truth.
  const TRICK_GAMES = new Set([
    'hearts', 'spades', 'euchre', 'whist', 'ohhell', 'oh-hell', 'war',
  ]);
  const isTrickGame = gameId !== undefined && TRICK_GAMES.has(gameId);

  const handleDrawDeck = () => {
    if (isMyTurn) emitAction('draw', undefined, { source: 'deck' });
  };
  const handleDrawDiscard = () => {
    if (isMyTurn) emitAction('draw', undefined, { source: 'discard' });
  };
  const handleLayDown = () => {
    // Phase 10: server auto-arranges from the full hand if no groups are
    // pre-selected, so we don't require selected cards here.
    if (isMyTurn) emitAction('lay-down', selectedCardIds.length > 0 ? selectedCardIds : undefined);
  };
  const handleDiscard = () => {
    if (isMyTurn && selectedCardIds.length > 0) emitAction('discard', selectedCardIds);
  };
  const handleSendToCrib = () => {
    if (selectedCardIds.length > 0) emitAction('discard-crib', selectedCardIds);
  };
  const handlePegPlay = () => {
    if (isMyTurn && selectedCardIds.length > 0) emitAction('play', selectedCardIds);
  };
  const handleGo = () => {
    if (isMyTurn) emitAction('go');
  };
  const handleSkip = () => emitAction('skip');
  const handleAckCount = () => emitAction('ack-count');

  const btnBase = [
    'px-4 py-3 min-h-[44px] rounded text-sm font-medium transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-indigo-400',
  ].join(' ');

  const btnEnabled = 'bg-indigo-600 hover:bg-indigo-500 text-white';
  const btnDisabled = 'bg-slate-700 text-slate-500 cursor-not-allowed';

  // --- Cribbage discarding phase: "Send to Crib" sends every selected card
  // in one shot (engine accepts a multi-card discard). When the player has
  // already discarded all they owe, switch to a waiting indicator while the
  // other players catch up.
  if (isDiscardingToCrib) {
    if (cribRemaining === 0) {
      return (
        <div
          className="flex flex-row flex-wrap gap-2 items-center px-3 sm:px-4 py-3 bg-slate-900 border-t border-slate-700 sticky bottom-0 z-10 min-h-[44px]"
          role="toolbar"
          aria-label={en.table.gameActions}
        >
          <span className="text-slate-300 text-sm">
            {en.table.waitingForPlayers}
          </span>
        </div>
      );
    }
    const canSend =
      selectedCardIds.length > 0 && selectedCardIds.length <= cribRemaining;
    return (
      <div
        className="flex flex-row flex-wrap gap-2 items-center px-3 sm:px-4 py-3 bg-slate-900 border-t border-slate-700 sticky bottom-0 z-10"
        role="toolbar"
        aria-label={en.table.gameActions}
      >
        <button
          type="button"
          onClick={handleSendToCrib}
          disabled={!canSend}
          className={`${btnBase} ${canSend ? 'bg-amber-600 hover:bg-amber-500 text-white' : btnDisabled}`}
          aria-label={en.table.toCribAria}
        >
          {en.table.toCrib}
        </button>
        <span className="text-slate-400 text-sm">
          {en.table.cribCountsRemaining.replace('{n}', String(cribRemaining))}
        </span>
      </div>
    );
  }

  // --- Cribbage pegging phase: clicking a card in the hand plays it directly,
  // and an unplayable hand triggers an auto-Go. The action bar just shows
  // the current state — no manual buttons required.
  if (isPegging) {
    return (
      <div
        className="flex flex-row flex-wrap gap-2 items-center px-3 sm:px-4 py-3 bg-slate-900 border-t border-slate-700 sticky bottom-0 z-10 min-h-[44px]"
        role="toolbar"
        aria-label={en.table.gameActions}
      >
        <span className="text-slate-300 text-sm">
          {isMyTurn ? 'Your turn — tap a card to play' : en.table.waitingForPlayers}
        </span>
      </div>
    );
  }

  // --- Cribbage counting phase: turn-based. ---
  // 'hand' step: only the currentCountPlayerId can ack their own score.
  // 'crib'  step: only the dealer can ack the crib.
  // Everyone else sees a waiting indicator. Pegs advance immediately on ack.
  if (isCounting) {
    const canAct =
      countingStep === 'crib'
        ? myPlayerId != null && myPlayerId === dealerPlayerId
        : myPlayerId != null && myPlayerId === currentCountPlayerId;
    const label = countingStep === 'crib' ? 'OK — Next Hand' : 'OK — Count';
    const waitingName =
      countingStep === 'crib'
        ? 'the dealer'
        : counterName || 'the next player';
    return (
      <div
        className="flex flex-row flex-wrap gap-2 items-center px-3 sm:px-4 py-3 bg-slate-900 border-t border-slate-700 sticky bottom-0 z-10 min-h-[44px]"
        role="toolbar"
        aria-label={en.table.gameActions}
      >
        {canAct ? (
          <button
            type="button"
            onClick={handleAckCount}
            className={`${btnBase} bg-amber-600 hover:bg-amber-500 text-white`}
          >
            {label}
          </button>
        ) : (
          <span className="text-slate-300 text-sm">
            Waiting for {waitingName} to count…
          </span>
        )}
      </div>
    );
  }

  // --- Trick-taking games (Hearts, Spades, Euchre, Whist, Oh Hell, War) ---
  if (isTrickGame) {
    const canPlay = isMyTurn && selectedCardIds.length > 0;
    // Hearts also has a "pass 3 cards" phase at the start of each hand.
    const isPassPhase = gameId === 'hearts';
    return (
      <div
        className="flex flex-row flex-wrap gap-2 items-center px-3 sm:px-4 py-3 bg-slate-900 border-t border-slate-700 sticky bottom-0 z-10"
        role="toolbar"
        aria-label={en.table.gameActions}
      >
        <button
          type="button"
          onClick={handlePegPlay}
          disabled={!canPlay}
          className={`${btnBase} ${canPlay ? btnEnabled : btnDisabled}`}
          aria-label="Play selected card"
        >
          Play
        </button>
        {isPassPhase && (
          <button
            type="button"
            onClick={() => {
              if (selectedCardIds.length === 3) emitAction('pass', selectedCardIds);
            }}
            disabled={!isMyTurn || selectedCardIds.length !== 3}
            className={`${btnBase} ${isMyTurn && selectedCardIds.length === 3 ? btnEnabled : btnDisabled}`}
            aria-label="Pass 3 selected cards"
          >
            Pass 3
          </button>
        )}
        {!isMyTurn && (
          <span className="text-slate-500 text-sm ml-2">
            {en.table.waitingForPlayers}
          </span>
        )}
      </div>
    );
  }

  // --- Default (Phase 10 / Canasta etc.) ---
  return (
    <div
      className="flex flex-row gap-2 items-center px-4 py-3 bg-slate-900 border-t border-slate-700"
      role="toolbar"
      aria-label={en.table.gameActions}
    >
      <button
        type="button"
        onClick={handleDrawDeck}
        disabled={!isMyTurn}
        className={`${btnBase} ${isMyTurn ? btnEnabled : btnDisabled}`}
        aria-label={en.table.drawDeckAria}
      >
        {en.table.drawDeck}
      </button>

      <button
        type="button"
        onClick={handleDrawDiscard}
        disabled={!isMyTurn}
        className={`${btnBase} ${isMyTurn ? btnEnabled : btnDisabled}`}
        aria-label={en.table.takeTopAria}
      >
        {en.table.takeTop}
      </button>

      <button
        type="button"
        onClick={handleLayDown}
        disabled={!isMyTurn}
        className={`${btnBase} ${isMyTurn ? btnEnabled : btnDisabled}`}
        aria-label={en.table.layDownAria}
      >
        {en.table.layDown}
      </button>

      <button
        type="button"
        onClick={handleDiscard}
        disabled={!isMyTurn || selectedCardIds.length === 0}
        className={`${btnBase} ${isMyTurn && selectedCardIds.length > 0 ? 'bg-red-700 hover:bg-red-600 text-white' : btnDisabled}`}
        aria-label={en.table.discardAria}
      >
        {en.table.discard}
      </button>

      <button
        type="button"
        onClick={handleSkip}
        disabled={!isMyTurn}
        className={`${btnBase} ${isMyTurn ? 'bg-slate-600 hover:bg-slate-500 text-white' : btnDisabled}`}
        aria-label={en.table.skipTurnAria}
      >
        {en.table.skipTurn}
      </button>

      {!isMyTurn && (
        <span className="text-slate-500 text-sm ml-2">
          {en.table.waitingForPlayers}
        </span>
      )}
    </div>
  );
}
