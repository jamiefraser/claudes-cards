/**
 * ActionBar — bottom action bar for game controls.
 * SPEC.md §15
 */
import React, { useCallback, useState } from 'react';
import { getGameSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/store/gameStore';
import { logger } from '@/utils/logger';
import type { GameActionPayload } from '@shared/socket';
import en from '@/i18n/en.json';
import {
  CanastaMeldTargetModal,
  type CanastaExtendableMeld,
} from './CanastaMeldTargetModal';
import {
  CanastaWildDistributionModal,
  type RankGroup,
} from './CanastaWildDistributionModal';

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
  /**
   * Canasta-only state. Drives the Meld / Discard bar and the wild-only
   * extend-target picker modal:
   *   - phase: current sub-phase (draw vs meld-discard vs ended)
   *   - selectedCards: the actual Card objects for `selectedCardIds` (needed
   *     to classify wild vs natural without another lookup). Array order
   *     follows the hand order.
   *   - extendableMelds: the player-side's existing melds that a wild-only
   *     selection can be added to (black-3 exit melds excluded).
   */
  canasta?: {
    phase: 'draw' | 'meld-discard' | 'ended';
    selectedCards: ReadonlyArray<{ id: string; rank?: string; suit?: string }>;
    extendableMelds: readonly CanastaExtendableMeld[];
  };
  /**
   * Phase 10 — true once the local player has laid down their phase. After
   * that the "Lay Down" button becomes a "Hit Meld" button (the engine only
   * accepts `lay-down` while the phase isn't yet down; after that, only
   * `hit-meld` can legally empty the hand).
   */
  phase10LaidDown?: boolean;
  /**
   * Called when the player clicks Hit Meld. The parent resolves the target
   * (via a modal picker that lists legal melds for the selection) and emits
   * the `hit-meld` action itself.
   */
  onPhase10HitRequest?: () => void;
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
  canasta,
  phase10LaidDown,
  onPhase10HitRequest,
}: ActionBarProps) {
  const clearSelection = useGameStore(s => s.clearSelection);
  const [extendModalOpen, setExtendModalOpen] = useState(false);

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
  const isCanasta = gameId === 'canasta';
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
    if (!isMyTurn) return;
    // Canasta's pickup is a separate engine action (take-discard) that
    // requires the player to nominate which hand cards will join the top
    // card in a meld. We forward the current selection as useCardIds; the
    // engine returns a specific error code if the selection is invalid or
    // missing, which the gameAction socket handler surfaces to a toast.
    if (isCanasta) {
      emitAction('take-discard', undefined, { useCardIds: [...selectedCardIds] });
      return;
    }
    emitAction('draw', undefined, { source: 'discard' });
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

  // --- Canasta meld handlers ------------------------------------------------
  // A canasta meld can be one of two shapes:
  //   - a brand-new meld: ≥3 cards sharing a natural rank, possibly with some
  //     wilds mixed in. The server accepts `action.cardIds` as a shorthand.
  //   - an extension: cards (incl. pure wild groups) added to one of the
  //     player's existing melds. Those must go through the payload shape
  //     { melds: [{ cardIds, extend: <rank> }] } because the server can't
  //     guess which existing meld to extend from a pure-wild selection.
  const canastaSelected = canasta?.selectedCards ?? [];
  const isWildCard = (c: { rank?: string; suit?: string }) =>
    c.rank === '2' || (c.rank === undefined && c.suit === undefined);
  const canastaAllWilds =
    canastaSelected.length > 0 &&
    canastaSelected.every(isWildCard);
  const canastaNaturals = canastaSelected.filter((c) => !isWildCard(c) && c.rank !== undefined);
  const canastaWilds = canastaSelected.filter(isWildCard);
  const canastaNaturalRanks = new Set(canastaNaturals.map((c) => c.rank!));

  // DEF-008: Pre-validate the meld selection. Disabled when the selection
  // cannot possibly form a legal meld:
  //   - All wilds: need at least 1 wild AND an existing meld to extend.
  //   - Single rank with extendable meld: any count >= 1 is valid (extension).
  //   - Single rank, new meld: need >= 3 cards total with wilds < naturals.
  //   - Multi-rank: each rank group must have enough naturals to form a legal
  //     group (>= 3 without wilds, >= 2 with wilds to fill the 3rd slot).
  const canastaCanMeld = (() => {
    if (!isMyTurn || canasta?.phase !== 'meld-discard' || canastaSelected.length === 0) return false;
    if (canastaAllWilds) {
      return canastaSelected.length >= 1 && (canasta?.extendableMelds.length ?? 0) > 0;
    }
    if (canastaNaturalRanks.size === 1) {
      const [rank] = Array.from(canastaNaturalRanks);
      const hasExtendable = canasta?.extendableMelds.some((m) => m.rank === rank);
      if (hasExtendable) {
        // Extending an existing meld — any selection of 1+ cards is fine.
        return canastaSelected.length >= 1;
      }
      // New meld: naturals + wilds >= 3, wilds < naturals.
      return (
        canastaNaturals.length + canastaWilds.length >= 3 &&
        canastaWilds.length < canastaNaturals.length
      );
    }
    // Multi-rank: each rank needs enough naturals to form a legal group.
    const rankCounts = new Map<string, number>();
    for (const c of canastaNaturals) {
      rankCounts.set(c.rank!, (rankCounts.get(c.rank!) ?? 0) + 1);
    }
    // Without wilds, each rank needs >= 3 naturals.
    if (canastaWilds.length === 0) {
      return Array.from(rankCounts.values()).every((n) => n >= 3);
    }
    // With wilds: each rank needs >= 2 naturals (a wild can fill the 3rd slot).
    return Array.from(rankCounts.values()).every((n) => n >= 2);
  })();
  const canastaCanDiscard =
    isMyTurn && canasta?.phase === 'meld-discard' && selectedCardIds.length === 1;

  // Wild distribution modal state (multi-rank + wilds).
  const [distributeModalOpen, setDistributeModalOpen] = useState(false);
  const [distributeRankGroups, setDistributeRankGroups] = useState<RankGroup[]>([]);
  const [distributeWildIds, setDistributeWildIds] = useState<string[]>([]);

  const handleCanastaMeld = () => {
    if (!canastaCanMeld) return;
    if (canastaAllWilds) {
      // Wild-only selection needs a target meld; ask the player.
      setExtendModalOpen(true);
      return;
    }

    // Build rank groups from natural cards.
    const rankGroupMap = new Map<string, string[]>();
    for (const c of canastaSelected) {
      if (isWildCard(c) || c.rank === undefined) continue;
      const ids = rankGroupMap.get(c.rank!) ?? [];
      ids.push(c.id);
      rankGroupMap.set(c.rank!, ids);
    }
    const wildCardIds_ = canastaSelected.filter(isWildCard).map((c) => c.id);

    if (rankGroupMap.size === 1) {
      // Single rank path — unchanged.
      const [naturalRank] = Array.from(rankGroupMap.keys());
      const existing = canasta?.extendableMelds.find((m) => m.rank === naturalRank);
      if (existing) {
        emitAction('meld', undefined, {
          melds: [{ cardIds: selectedCardIds, extend: naturalRank }],
        });
        return;
      }
      emitAction('meld', selectedCardIds);
      return;
    }

    // Multi-rank path (DEF-002 fix).
    if (wildCardIds_.length > 0) {
      // Wilds present alongside multiple natural ranks — open distribution modal.
      const groups: RankGroup[] = Array.from(rankGroupMap.entries()).map(
        ([rank, ids]) => ({ rank, naturalCardIds: ids }),
      );
      setDistributeRankGroups(groups);
      setDistributeWildIds(wildCardIds_);
      setDistributeModalOpen(true);
      return;
    }

    // No wilds — group by rank and submit all groups at once.
    const melds = Array.from(rankGroupMap.entries()).map(([_rank, ids]) => ({
      cardIds: ids,
    }));
    emitAction('meld', undefined, { melds });
  };

  const handleWildDistributionConfirm = (distribution: Array<{ cardIds: string[]; rank: string }>) => {
    setDistributeModalOpen(false);
    // Check if any group extends an existing meld.
    const melds = distribution.map((group) => {
      const existing = canasta?.extendableMelds.find((m) => m.rank === group.rank);
      if (existing) {
        return { cardIds: group.cardIds, extend: group.rank };
      }
      return { cardIds: group.cardIds };
    });
    emitAction('meld', undefined, { melds });
  };
  const handleCanastaExtendPick = (rank: string) => {
    setExtendModalOpen(false);
    if (!canastaCanMeld) return;
    emitAction('meld', undefined, {
      melds: [{ cardIds: selectedCardIds, extend: rank }],
    });
  };
  const handleKnock = () => {
    if (isMyTurn) emitAction('knock');
  };
  const handleAckShow = () => emitAction('ack-show');

  const barBase = [
    // Mobile: horizontal scroll strip so 5+ buttons don't wrap to two
    // rows at 375px. Tablet+: normal pill that sizes to content.
    'flex flex-row items-center gap-1.5 sm:gap-2',
    'px-3 sm:px-4 py-1.5 sm:py-2 min-h-[52px] sm:min-h-[56px] rounded-3xl sm:rounded-full',
    'w-[calc(100vw-16px)] sm:w-auto max-w-full',
    'bg-paper-raised/90 backdrop-blur',
    'border border-hairline/60 shadow-paper',
    'overflow-x-auto sm:overflow-visible no-scrollbar',
    'animate-seat-in',
  ].join(' ');

  const btnBase = [
    // Compact on mobile (still 44px tap target), full-size on tablet+.
    // flex-none stops the scroll strip from shrinking buttons below tap.
    'flex-none px-3 sm:px-5 py-2 sm:py-2.5 min-h-[44px] min-w-[44px] rounded-full',
    'text-xs sm:text-sm font-semibold tracking-wide whitespace-nowrap',
    // Never `transition-all` — list what actually changes so the compositor
    // doesn't invalidate every frame.
    'transition-[transform,box-shadow,background-color,border-color,color,filter] duration-180 ease-[cubic-bezier(0.22,1,0.36,1)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
  ].join(' ');

  const btnPrimary = [
    'bg-gradient-to-b from-ochre-hi to-ochre text-accent-fg',
    'shadow-[inset_0_1px_0_rgb(var(--paper)_/_0.45),0_6px_16px_-6px_rgb(var(--ochre)_/_0.55)]',
    'hover:brightness-105 active:translate-y-[1px]',
  ].join(' ');

  const btnGhost = [
    'bg-paper-deep/40 text-ink-soft border border-hairline',
    'hover:border-ochre hover:bg-paper-deep/70 hover:text-ink',
  ].join(' ');

  const btnDanger = [
    'bg-burgundy text-paper border border-burgundy/60',
    'hover:brightness-110',
  ].join(' ');

  const btnEnabled = btnPrimary;
  const btnDisabled = 'bg-paper-deep/50 text-whisper/70 border border-hairline/60 disabled:cursor-not-allowed';

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

  // --- Canasta ---
  // A turn has two sub-phases driven by `canasta.phase`:
  //   draw         → Draw Deck / Take Top. Taking the pile triggers the
  //                  engine's take-discard branch.
  //   meld-discard → Meld (sends the selected cards) / Discard (single card).
  // If the meld selection is all wilds the player is prompted to pick which
  // existing meld to extend, because a brand-new meld must contain a natural.
  if (isCanasta) {
    const phase = canasta?.phase ?? 'draw';
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
    // meld-discard
    return (
      <div className={barBase} role="toolbar" aria-label={en.table.gameActions}>
        <button
          type="button"
          onClick={handleCanastaMeld}
          disabled={!canastaCanMeld}
          className={`${btnBase} ${canastaCanMeld ? btnEnabled : btnDisabled}`}
          aria-label={en.table.canastaMeldAria}
        >
          {en.table.canastaMeld}
        </button>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={!canastaCanDiscard}
          className={`${btnBase} ${canastaCanDiscard ? btnDanger : btnDisabled}`}
          aria-label={en.table.discardAria}
        >
          {en.table.discard}
        </button>
        {!isMyTurn && (
          <span className="text-parchment/50 text-sm ml-2 italic font-display">
            {en.table.waitingForPlayers}
          </span>
        )}
        <CanastaMeldTargetModal
          isOpen={extendModalOpen}
          melds={canasta?.extendableMelds ?? []}
          onPick={handleCanastaExtendPick}
          onClose={() => setExtendModalOpen(false)}
        />
        <CanastaWildDistributionModal
          isOpen={distributeModalOpen}
          rankGroups={distributeRankGroups}
          wildCardIds={distributeWildIds}
          onConfirm={handleWildDistributionConfirm}
          onClose={() => setDistributeModalOpen(false)}
        />
      </div>
    );
  }

  // --- Default (Phase 10 etc.) ---
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

      {phase10LaidDown ? (
        <button
          type="button"
          onClick={() => {
            if (!isMyTurn) return;
            // The parent opens a target-picker modal. If it's a single wild
            // the picker is essential (the wild could extend any meld); for
            // naturals it still lets the player resolve which meld to hit.
            onPhase10HitRequest?.();
          }}
          disabled={!isMyTurn || selectedCardIds.length === 0}
          className={`${btnBase} ${
            isMyTurn && selectedCardIds.length > 0 ? btnEnabled : btnDisabled
          }`}
          aria-label={en.table.phase10HitAria}
        >
          {en.table.phase10Hit}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleLayDown}
          disabled={!isMyTurn}
          className={`${btnBase} ${isMyTurn ? btnEnabled : btnDisabled}`}
          aria-label={en.table.layDownAria}
        >
          {en.table.layDown}
        </button>
      )}

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
