/**
 * ActionBar — bottom action bar for game controls.
 * SPEC.md §15
 */
import React, { useCallback, useEffect, useState } from 'react';
import { getGameSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/store/gameStore';
import { logger } from '@/utils/logger';
import type { GameActionPayload } from '@shared/socket';
import type { CanastaStagedMeld } from '@/store/gameStore';
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
    /** Total cards in the local player's hand (needed to gate going-out). */
    handSize: number;
    /** Number of canastas the local player's side already has on the board. */
    sideCanastaCount: number;
    /** Canastas required to go out (variant-dependent). */
    goOutRequirement: number;
    /** Rank of the current discard-pile top card (drives pickup partition). */
    discardTopRank?: string;
    /** True when the pile is frozen OR side has not yet made initial meld. */
    discardFrozen?: boolean;
    /** True when the local player's side has already made its initial meld. */
    initialMeldDone?: boolean;
    /** Local player's side score prior to this hand — drives threshold. */
    sideScorePrior?: number;
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
  const pickupMode = useGameStore(s => s.canastaPickup.active);
  const stagedMelds = useGameStore(s => s.canastaPickup.stagedMelds);
  const setCanastaStagedMelds = useGameStore(s => s.setCanastaStagedMelds);
  const cancelCanastaPickupStore = useGameStore(s => s.cancelCanastaPickup);
  const [extendModalOpen, setExtendModalOpen] = useState(false);

  // Auto-exit pickup mode when the engine has moved us out of the draw
  // phase (e.g. the plan was accepted and we're now in meld-discard), or
  // when the turn passes to another player. Prevents the staging UI from
  // lingering once it's no longer actionable.
  useEffect(() => {
    if (!pickupMode) return;
    const stillActionable =
      isMyTurn && gameId === 'canasta' && canasta?.phase === 'draw';
    if (!stillActionable) cancelCanastaPickupStore();
  }, [pickupMode, isMyTurn, gameId, canasta?.phase, cancelCanastaPickupStore]);

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
  // Accept both forms: the engine registers itself as 'ginrummy' (one
  // word) but the seeded `games.id` row in the DB is 'gin-rummy' (kebab),
  // and `state.gameId` carries through whichever form room creation used.
  // Without the kebab fallback the default ActionBar (Lay Down / Discard /
  // Skip Turn) gets rendered for gin rummy, with no Knock/Gin button at
  // all and a non-functional "Lay Down" emit.
  const isGinRummy = gameId === 'ginrummy' || gameId === 'gin-rummy';
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

  // Draw-phase actions (Draw Deck, Take Top) are no longer buttons — the
  // user clicks the draw pile and discard pile directly. The pile click
  // handlers live in GameTable; Canasta's pickup-mode entry is a store
  // action (startCanastaPickup) that this component reacts to below.

  // Pickup-staging handlers.
  const submitPickupPlan = useCallback(
    (plan: CanastaStagedMeld[]) => {
      const topMeld = plan.find((m) => m.includesTop);
      if (!topMeld) return;
      const useCardIds = topMeld.cards.map((c) => c.id);
      const melds = plan
        .filter((m) => !m.includesTop)
        .map((m) => m.cards.map((c) => c.id));
      const payload: Record<string, unknown> = { useCardIds };
      if (melds.length > 0) payload.melds = melds;
      emitAction('take-discard', undefined, payload);
      cancelCanastaPickupStore();
    },
    [emitAction, cancelCanastaPickupStore],
  );

  const handleStageMeld = () => {
    if (!pickupMode || !canasta || !isMyTurn) return;
    const topRank = canasta.discardTopRank;
    if (!topRank) return;
    // Resolve selection to full-info cards and drop any that are already
    // staged (prevents double-counting when the player forgets to clear).
    const selection = canastaSelected.filter((c) => !stagedCardIds.has(c.id));
    if (selection.length === 0) return;

    const naturalsOfTopInSelection = selection.filter(
      (c) => c.rank === topRank && (c.suit === 'hearts' || c.suit === 'diamonds' || c.suit === 'clubs' || c.suit === 'spades'),
    );
    const wildsInSelection = selection.filter(isWildCard);
    const otherNaturalsInSelection = selection.filter(
      (c) => c.rank !== topRank && c.rank !== undefined && !isWildCard(c),
    );

    // First meld in pickup mode must be the pickup meld: ≥2 naturals of the
    // top card's rank (from hand) + top card + optional wilds. Matching the
    // engine's frozen rule which also applies whenever the side has not yet
    // made its initial meld (Hoyle "effectively frozen").
    if (!pickupHasTopMeld) {
      if (naturalsOfTopInSelection.length < 2) {
        logger.warn('Pickup: first meld must contain >= 2 naturals of the top rank from hand');
        return;
      }
      if (otherNaturalsInSelection.length > 0) {
        logger.warn('Pickup: first meld may only contain top-rank naturals and wilds');
        return;
      }
      const newMeld: CanastaStagedMeld = {
        id: `stg-${Date.now()}-${stagedMelds.length}`,
        cards: selection,
        includesTop: true,
      };
      const next = [...stagedMelds, newMeld];
      // Recompute total with the just-staged meld included.
      let newTotal = canastaCardValue({ rank: topRank });
      for (const m of next) {
        for (const c of m.cards) newTotal += canastaCardValue(c);
      }
      clearSelection();
      if (newTotal >= pickupThreshold) {
        submitPickupPlan(next);
      } else {
        setCanastaStagedMelds(next);
      }
      return;
    }

    // Subsequent melds: single-rank group from hand, wilds ≤ naturals, ≥ 3 cards.
    if (otherNaturalsInSelection.length === 0) {
      logger.warn('Pickup: additional meld needs at least one non-top-rank natural');
      return;
    }
    const ranks = new Set(otherNaturalsInSelection.map((c) => c.rank!));
    if (ranks.size !== 1) {
      logger.warn('Pickup: additional meld must be single-rank');
      return;
    }
    if (selection.length < 3) {
      logger.warn('Pickup: additional meld needs at least 3 cards');
      return;
    }
    if (wildsInSelection.length >= otherNaturalsInSelection.length) {
      logger.warn('Pickup: additional meld must have more naturals than wilds');
      return;
    }
    const newMeld: CanastaStagedMeld = {
      id: `stg-${Date.now()}-${stagedMelds.length}`,
      cards: selection,
      includesTop: false,
    };
    const next = [...stagedMelds, newMeld];
    let newTotal = canastaCardValue({ rank: topRank });
    for (const m of next) {
      for (const c of m.cards) newTotal += canastaCardValue(c);
    }
    clearSelection();
    if (newTotal >= pickupThreshold) {
      submitPickupPlan(next);
    } else {
      setCanastaStagedMelds(next);
    }
  };

  const handleCancelPickup = () => {
    cancelCanastaPickupStore();
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

  // All-black-3 selection: rank '3' + suit clubs/spades + no wilds. Black 3s
  // are "stop cards" and are only legally meldable on the going-out turn —
  // the engine rejects them otherwise. Detect here so we can both gate the
  // Meld button (below) and send `goingOut:true` on the payload.
  const canastaAllBlackThrees =
    canastaSelected.length >= 3 &&
    canastaWilds.length === 0 &&
    canastaSelected.every(
      (c) => c.rank === '3' && (c.suit === 'clubs' || c.suit === 'spades'),
    );
  // Going-out pre-conditions for any all-black-3 meld: after the meld, hand
  // must reduce to exactly 1 card (the forced discard) AND side must hold
  // goOutRequirement canastas. Mirrors engine.ts handleMeld post-check.
  const canastaCanGoOutWithBlackThrees =
    canastaAllBlackThrees &&
    canasta !== undefined &&
    canasta.handSize === canastaSelected.length + 1 &&
    canasta.sideCanastaCount >= canasta.goOutRequirement;

  // DEF-008: Pre-validate the meld selection. Disabled when the selection
  // cannot possibly form a legal meld:
  //   - All wilds: need at least 1 wild AND an existing meld to extend.
  //   - Single rank with extendable meld: any count >= 1 is valid (extension).
  //   - Single rank, new meld: need >= 3 cards total with wilds < naturals.
  //   - Multi-rank: each rank group must have enough naturals to form a legal
  //     group (>= 3 without wilds, >= 2 with wilds to fill the 3rd slot).
  const canastaCanMeld = (() => {
    if (!isMyTurn || canasta?.phase !== 'meld-discard' || canastaSelected.length === 0) return false;
    // All-black-3 selection only permitted when the player can actually go
    // out this turn (engine enforces the same rule on the server side).
    if (canastaAllBlackThrees) {
      return canastaCanGoOutWithBlackThrees;
    }
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

  // Card-point values — used by pickup-staging to compute the running total
  // against the initial-meld threshold. Matches canastaCardPoints in the
  // engine (wilds count at face value, bonuses excluded).
  const canastaCardValue = (c: { rank?: string; suit?: string }): number => {
    if (c.rank === undefined && c.suit === undefined) return 50;
    if (c.rank === '2') return 20;
    if (c.rank === 'A') return 20;
    if (c.rank === '3') return 5;
    if (c.rank && ['J', 'Q', 'K', '10', '9', '8'].includes(c.rank)) return 10;
    return 5;
  };
  const initialMeldMinimum = (priorScore: number): number => {
    if (priorScore < 0) return 15;
    if (priorScore < 1500) return 50;
    if (priorScore < 3000) return 90;
    return 120;
  };
  // Wild distribution modal state (multi-rank + wilds).
  const [distributeModalOpen, setDistributeModalOpen] = useState(false);
  const [distributeRankGroups, setDistributeRankGroups] = useState<RankGroup[]>([]);
  const [distributeWildIds, setDistributeWildIds] = useState<string[]>([]);

  // ── Canasta pickup-staging state ────────────────────────────────────────
  // Pickup mode is triggered by clicking the discard pile during the draw
  // phase (see GameTable's pile onClick). The top card of the discard pile
  // is reserved, and the player builds the melds they want to lay down
  // using the pile's top card iteratively. The first staged meld must
  // include the top card (via naturals of its rank from hand + optional
  // wilds). Additional melds are staged from hand only. When the running
  // point total crosses the initial-meld threshold, the compiled plan is
  // auto-submitted as a `take-discard` action and the engine picks up the
  // rest of the pile.
  //
  // Pickup state lives in the Zustand store (canastaPickup) so GameTable's
  // pile click and this component share one source of truth — see
  // gameStore.ts CanastaPickupState.
  const stagedCardIds = new Set(stagedMelds.flatMap((m) => m.cards.map((c) => c.id)));
  const pickupHasTopMeld = stagedMelds.some((m) => m.includesTop);
  const pickupTotalPoints = (() => {
    if (!canasta) return 0;
    let total = 0;
    if (pickupHasTopMeld && canasta.discardTopRank) {
      total += canastaCardValue({ rank: canasta.discardTopRank });
    }
    for (const m of stagedMelds) {
      for (const c of m.cards) total += canastaCardValue(c);
    }
    return total;
  })();
  const pickupThreshold = canasta?.initialMeldDone
    ? 0
    : initialMeldMinimum(canasta?.sideScorePrior ?? 0);

  const handleCanastaMeld = () => {
    if (!canastaCanMeld) return;
    if (canastaAllBlackThrees) {
      // Black-3 exit meld. Engine requires `goingOut:true` on the group;
      // canastaCanMeld has already validated the going-out pre-conditions.
      emitAction('meld', undefined, {
        melds: [{ cardIds: selectedCardIds, goingOut: true }],
      });
      return;
    }
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
    if (!isMyTurn) return;
    // The engine treats knock / gin / bigGin as three distinct action
    // types and the core rejects 'knock' with zero deadwood ("use `gin`
    // instead"). The button is cosmetically labelled "Knock" / "Gin" /
    // "Big Gin" based on `ginrummyKnock.isGin` / `isBigGin`, so we
    // dispatch the matching action type here instead of always sending
    // 'knock' (which would trip the validator and surface as an
    // INVALID_ACTION toast — players were unable to call gin or
    // big-gin).
    const knock = ginrummyKnock;
    if (knock?.isBigGin) {
      emitAction('bigGin');
      return;
    }
    if (knock?.isGin) {
      emitAction('gin');
      return;
    }
    emitAction('knock');
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
        {/* Draw Deck is handled by clicking the draw pile directly (see
            GameTable pile onClick). No button needed here. */}
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
    // One bar for both turn-phases. The Discard and Knock/Gin/Big-Gin
    // buttons are always rendered (per UX request: visible-but-disabled
    // until usable) so the player never has to guess which actions
    // exist. The Lay Down / Skip Turn buttons from the default fallback
    // bar must NOT appear here — `lay-down` is a Phase 10 action and
    // produces "no command layDown" errors against the gin rummy
    // engine.
    const phase = ginrummyKnock?.turnPhase ?? 'draw';
    const isDrawPhase = phase === 'draw';
    const knock = ginrummyKnock;
    const canDiscard = isMyTurn && !isDrawPhase && selectedCardIds.length === 1;
    const canKnock = isMyTurn && !isDrawPhase && !!knock?.canKnock;
    const knockLabel = knock?.isBigGin
      ? 'Big Gin'
      : knock?.isGin
        ? 'Gin'
        : 'Knock';
    // Tooltip text describes exactly why the button is disabled, so the
    // player can self-diagnose without consulting the rules panel.
    const knockAria = !isMyTurn
      ? 'Wait for your turn to call knock or gin'
      : isDrawPhase
        ? 'Draw a card before calling knock or gin'
        : !knock?.canKnock
          ? `Cannot knock — deadwood ${knock?.deadwood ?? 0} (must be ≤ 10)`
          : knock?.isBigGin
            ? 'Declare Big Gin and end the round'
            : knock?.isGin
              ? 'Declare Gin and end the round'
              : `Knock with ${knock?.deadwood ?? 0} deadwood and end the round`;
    const discardAria = !isMyTurn
      ? 'Wait for your turn to discard'
      : isDrawPhase
        ? 'Draw a card before discarding'
        : selectedCardIds.length !== 1
          ? 'Select exactly one card to discard'
          : en.table.discardAria;
    return (
      <div className={barBase} role="toolbar" aria-label={en.table.gameActions}>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={!canDiscard}
          className={`${btnBase} ${canDiscard ? btnGhost : btnDisabled}`}
          aria-label={discardAria}
          title={discardAria}
        >
          {en.table.discard}
        </button>
        <button
          type="button"
          onClick={handleKnock}
          disabled={!canKnock}
          className={`${btnBase} ${canKnock ? btnPrimary : btnDisabled}`}
          aria-label={knockAria}
          title={knockAria}
        >
          {knockLabel}
          {/* Deadwood badge only for plain Knock — Gin/Big Gin are
              zero-deadwood by definition. While disabled (draw phase or
              ineligible) we still show the running deadwood count so
              the player can plan their discards. */}
          {!knock?.isGin && !knock?.isBigGin && knock?.deadwood !== undefined && (
            <span
              className={`ml-2 text-xs font-display tabular-nums ${
                canKnock ? 'text-night/70' : 'text-parchment/40'
              }`}
            >
              {knock.deadwood}
            </span>
          )}
        </button>
        {/* Hint / waiting text: draw-phase tells the player to click
            the piles; otherwise off-turn shows the waiting message. */}
        {isDrawPhase && isMyTurn && (
          <span
            className="text-parchment/70 text-sm font-display italic ml-2"
            aria-live="polite"
          >
            {en.table.drawHint}
          </span>
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
    if (phase === 'draw' && pickupMode) {
      // Pickup mode: replace the draw buttons with Stage Meld + Cancel +
      // a running threshold indicator. The player builds the meld plan
      // iteratively; the plan auto-submits once the threshold is crossed.
      return (
        <div
          className={[barBase, 'flex-col items-stretch gap-2'].join(' ')}
          role="toolbar"
          aria-label={en.table.gameActions}
        >
          <div
            className="flex flex-row items-center gap-3 text-parchment text-sm font-display"
            aria-live="polite"
          >
            <span className="font-semibold">
              {en.table.canastaPickupProgress
                .replace('{total}', String(pickupTotalPoints))
                .replace('{threshold}', String(pickupThreshold))}
            </span>
            {canasta?.discardTopRank && (
              <span className="opacity-80">
                {en.table.canastaPickupTopCardLabel.replace(
                  '{rank}',
                  canasta.discardTopRank,
                )}
              </span>
            )}
            <span className={pickupHasTopMeld ? 'text-sage' : 'text-burgundy'}>
              {pickupHasTopMeld
                ? en.table.canastaPickupTopCardUsed
                : en.table.canastaPickupTopCardPending}
            </span>
            <span className="opacity-70">
              {en.table.canastaPickupStagedCount.replace(
                '{count}',
                String(stagedMelds.length),
              )}
            </span>
          </div>
          <div className="flex flex-row items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleStageMeld}
              disabled={!isMyTurn || canastaSelected.length === 0}
              className={`${btnBase} ${isMyTurn && canastaSelected.length > 0 ? btnEnabled : btnDisabled}`}
              aria-label={en.table.canastaPickupStageAria}
            >
              {pickupHasTopMeld
                ? en.table.canastaPickupStageMeld
                : en.table.canastaPickupStageTopMeld}
            </button>
            <button
              type="button"
              onClick={handleCancelPickup}
              className={`${btnBase} ${btnGhost}`}
              aria-label={en.table.canastaPickupCancelAria}
            >
              {en.table.canastaPickupCancel}
            </button>
          </div>
        </div>
      );
    }
    if (phase === 'draw') {
      return (
        <div className={barBase} role="toolbar" aria-label={en.table.gameActions}>
          {/* Draw Deck / Take Top are handled by clicking the piles
              directly (see GameTable draw/discard pile onClick).
              Clicking the discard pile enters pickup mode for canasta. */}
          <span
            className={`text-parchment/70 text-sm font-display italic ${isMyTurn ? '' : 'opacity-60'}`}
            aria-live="polite"
          >
            {isMyTurn ? en.table.drawHint : en.table.waitingForPlayers}
          </span>
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
      {/* Draw Deck / Take Top are handled by clicking the piles directly
          (see GameTable draw/discard pile onClick). */}

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
