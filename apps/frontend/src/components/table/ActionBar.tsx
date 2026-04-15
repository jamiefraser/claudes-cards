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
  /** Display name of this round's dealer (cribbage). */
  dealerName?: string;
  /** This client's own playerId. */
  myPlayerId?: string;
  /** Display name of the active counter (for the waiting message). */
  counterName?: string;
  /** Gin Rummy: knock/gin/big-gin eligibility for the local player. */
  ginrummyKnock?: {
    canKnock: boolean;
    isGin: boolean;
    isBigGin: boolean;
    deadwood: number;
    turnPhase: 'draw' | 'discard';
  };
  /** Gin Rummy: showdown state when a knock has been called. */
  ginrummyShowdown?: {
    active: boolean;
    iHaveAcked: boolean;
    waitingOn: string[];
  };
  /**
   * Rank of the single selected card (if exactly one). Drives Crazy Eights's
   * wild-suit picker: when the selected card is an 8, the Play button is
   * replaced by four suit buttons so the player can declare a suit.
   */
  selectedCardRank?: string;
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
  dealerName,
  myPlayerId,
  counterName = '',
  ginrummyKnock,
  ginrummyShowdown,
  selectedCardRank,
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
  const isGinRummy = gameId === 'ginrummy';
  // Accept both the engine's compact id and the hyphenated Room/seed form.
  const isCrazyEights = gameId === 'crazyeights' || gameId === 'crazy-eights';
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
  const handleKnock = () => {
    if (isMyTurn) emitAction('knock');
  };
  const handleAckShow = () => emitAction('ack-show');

  const barBase = [
    'inline-flex flex-row flex-wrap gap-2 items-center',
    'px-3 sm:px-4 py-2 min-h-[56px] rounded-full',
    'bg-night-raised/85 backdrop-blur',
    'border border-brass/25 shadow-float',
    'animate-[seat-in_260ms_ease-out_both]',
  ].join(' ');

  const btnBase = [
    'px-5 py-2.5 min-h-[44px] rounded-full text-sm font-semibold tracking-wide',
    'transition-all duration-150',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary',
  ].join(' ');

  const btnPrimary = [
    'bg-gradient-to-b from-brass-bright to-brass text-night',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_16px_-6px_rgba(200,169,106,0.6)]',
    'hover:brightness-105 active:translate-y-[1px]',
  ].join(' ');

  const btnGhost = [
    'bg-night/60 text-parchment/90 border border-brass/15',
    'hover:border-brass/40 hover:text-parchment',
  ].join(' ');

  const btnDanger = [
    'bg-rose-600/90 text-white border border-rose-400/40',
    'hover:bg-rose-500',
  ].join(' ');

  const btnEnabled = btnPrimary;
  const btnDisabled = 'bg-night/40 text-parchment/30 border border-brass/10 cursor-not-allowed';

  // --- Cribbage discarding phase: "Send to Crib" sends every selected card
  // in one shot (engine accepts a multi-card discard). When the player has
  // already discarded all they owe, switch to a waiting indicator while the
  // other players catch up.
  if (isDiscardingToCrib) {
    if (cribRemaining === 0) {
      return (
        <div
          className={barBase}
          role="toolbar"
          aria-label={en.table.gameActions}
        >
          <span className="text-parchment/75 text-sm font-display italic">
            {en.table.waitingForPlayers}
          </span>
        </div>
      );
    }
    const canSend =
      selectedCardIds.length > 0 && selectedCardIds.length <= cribRemaining;
    const dealerIsMe = !!dealerPlayerId && dealerPlayerId === myPlayerId;
    const cribLabel = dealerIsMe
      ? en.table.toCribOwn
      : dealerName
        ? en.table.toCribOther.replace('{name}', dealerName)
        : en.table.toCrib;
    return (
      <div
        className={barBase}
        role="toolbar"
        aria-label={en.table.gameActions}
      >
        <button
          type="button"
          onClick={handleSendToCrib}
          disabled={!canSend}
          className={`${btnBase} ${canSend ? btnPrimary : btnDisabled}`}
          aria-label={en.table.toCribAria}
        >
          {cribLabel}
        </button>
        <span className="text-parchment/60 text-sm">
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
        className={barBase}
        role="toolbar"
        aria-label={en.table.gameActions}
      >
        <span className="text-parchment/75 text-sm font-display italic">
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
        className={barBase}
        role="toolbar"
        aria-label={en.table.gameActions}
      >
        {canAct ? (
          <button
            type="button"
            onClick={handleAckCount}
            className={`${btnBase} ${btnPrimary}`}
          >
            {label}
          </button>
        ) : (
          <span className="text-parchment/75 text-sm font-display italic">
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
        className={barBase}
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
          <span className="text-parchment/50 text-sm ml-2 italic font-display">
            {en.table.waitingForPlayers}
          </span>
        )}
      </div>
    );
  }

  // --- Crazy Eights ---
  // Two legal actions: `play` (a card from your hand that matches the top
  // discard by rank or suit, or any 8) and `draw` (from the stock). The
  // previous default bar wrongly showed Lay Down / Discard / Skip Turn, none
  // of which the engine accepts, so valid plays silently failed.
  if (isCrazyEights) {
    const hasSelection = selectedCardIds.length === 1;
    const canPlay = isMyTurn && hasSelection;
    const isWild = hasSelection && selectedCardRank === '8';
    const playEight = (suit: 'spades' | 'hearts' | 'diamonds' | 'clubs') => {
      if (!canPlay) return;
      emitAction('play', selectedCardIds, { suit });
    };
    const suitGlyph: Record<string, string> = {
      spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
    };
    const suitColor: Record<string, string> = {
      spades: 'text-parchment', clubs: 'text-parchment',
      hearts: 'text-rose-400', diamonds: 'text-rose-400',
    };
    return (
      <div className={barBase} role="toolbar" aria-label={en.table.gameActions}>
        {isWild ? (
          <>
            <span className="text-parchment/80 text-sm font-display italic pl-1 pr-2">
              Declare suit:
            </span>
            {(['spades', 'hearts', 'diamonds', 'clubs'] as const).map((suit) => (
              <button
                key={suit}
                type="button"
                onClick={() => playEight(suit)}
                className={`${btnBase} ${btnEnabled} ${suitColor[suit]} min-w-[56px] text-xl leading-none`}
                aria-label={`Play 8 and declare ${suit}`}
              >
                {suitGlyph[suit]}
              </button>
            ))}
          </>
        ) : (
          <button
            type="button"
            onClick={handlePegPlay}
            disabled={!canPlay}
            className={`${btnBase} ${canPlay ? btnEnabled : btnDisabled}`}
            aria-label="Play selected card"
          >
            Play
          </button>
        )}
        <button
          type="button"
          onClick={handleDrawDeck}
          disabled={!isMyTurn}
          className={`${btnBase} ${isMyTurn ? btnGhost : btnDisabled}`}
          aria-label={en.table.drawDeckAria}
        >
          {en.table.drawDeck}
        </button>
        {!isMyTurn && (
          <span className="text-parchment/50 text-sm ml-2 italic font-display">
            {en.table.waitingForPlayers}
          </span>
        )}
      </div>
    );
  }

  // --- Gin Rummy showdown — both hands revealed; wait for human acks. ---
  if (ginrummyShowdown?.active) {
    return (
      <div className={barBase} role="toolbar" aria-label={en.table.gameActions}>
        {!ginrummyShowdown.iHaveAcked ? (
          <button
            type="button"
            onClick={handleAckShow}
            className={`${btnBase} ${btnPrimary}`}
            aria-label="Acknowledge the showdown and continue"
          >
            Continue
          </button>
        ) : (
          <span className="text-parchment/75 text-sm font-display italic">
            {ginrummyShowdown.waitingOn.length > 0
              ? `Waiting for ${ginrummyShowdown.waitingOn.join(', ')}…`
              : 'Settling…'}
          </span>
        )}
      </div>
    );
  }

  // --- Gin Rummy ---
  // Draw phase: pick from deck or discard pile.
  // Discard phase: discard the selected card, OR Knock / Gin / Big Gin
  // when the hand's deadwood is low enough. The engine accepts a single
  // 'knock' action for all three; the label is purely cosmetic.
  if (isGinRummy) {
    const phase = ginrummyKnock?.turnPhase ?? 'draw';
    if (phase === 'draw') {
      return (
        <div className={barBase} role="toolbar" aria-label={en.table.gameActions}>
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
            className={`${btnBase} ${isMyTurn ? btnGhost : btnDisabled}`}
            aria-label={en.table.takeTopAria}
          >
            {en.table.takeTop}
          </button>
          {!isMyTurn && (
            <span className="text-parchment/50 text-sm ml-2 italic font-display">
              {en.table.waitingForPlayers}
            </span>
          )}
        </div>
      );
    }
    // discard phase
    const canDiscard = isMyTurn && selectedCardIds.length === 1;
    const knock = ginrummyKnock;
    const knockLabel = knock?.isBigGin
      ? 'Big Gin'
      : knock?.isGin
        ? 'Gin'
        : 'Knock';
    const knockAria = knock?.isBigGin
      ? 'Declare Big Gin and end the round'
      : knock?.isGin
        ? 'Declare Gin and end the round'
        : `Knock with ${knock?.deadwood ?? 0} deadwood and end the round`;
    return (
      <div className={barBase} role="toolbar" aria-label={en.table.gameActions}>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={!canDiscard}
          className={`${btnBase} ${canDiscard ? btnGhost : btnDisabled}`}
          aria-label={en.table.discardAria}
        >
          {en.table.discard}
        </button>
        {knock?.canKnock && isMyTurn && (
          <button
            type="button"
            onClick={handleKnock}
            className={`${btnBase} ${btnPrimary}`}
            aria-label={knockAria}
          >
            {knockLabel}
            {!knock.isGin && (
              <span className="ml-2 text-night/70 text-xs font-display tabular-nums">
                {knock.deadwood}
              </span>
            )}
          </button>
        )}
        {!isMyTurn && (
          <span className="text-parchment/50 text-sm ml-2 italic font-display">
            {en.table.waitingForPlayers}
          </span>
        )}
      </div>
    );
  }

  // --- Default (Phase 10 / Canasta etc.) ---
  return (
    <div
      className={barBase}
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
        className={`${btnBase} ${isMyTurn && selectedCardIds.length > 0 ? btnDanger : btnDisabled}`}
        aria-label={en.table.discardAria}
      >
        {en.table.discard}
      </button>

      <button
        type="button"
        onClick={handleSkip}
        disabled={!isMyTurn}
        className={`${btnBase} ${isMyTurn ? btnGhost : btnDisabled}`}
        aria-label={en.table.skipTurnAria}
      >
        {en.table.skipTurn}
      </button>

      {!isMyTurn && (
        <span className="text-parchment/50 text-sm ml-2 italic font-display">
          {en.table.waitingForPlayers}
        </span>
      )}
    </div>
  );
}
