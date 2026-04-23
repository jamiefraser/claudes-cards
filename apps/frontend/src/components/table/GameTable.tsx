/**
 * GameTable — root table layout for an active game.
 * SPEC.md §15
 *
 * Uses @dnd-kit for drag-and-drop card mechanics.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useGameStore } from '@/store/gameStore';
import { useGameState } from '@/hooks/useGameState';
import { useGameError } from '@/hooks/useGameError';
import { useAuth } from '@/auth/useAuth';
import { getGameSocket } from '@/hooks/useSocket';
import { logger } from '@/utils/logger';
import { HandComponent } from '../cards/HandComponent';
import { PileComponent } from '../cards/PileComponent';
import { PlayerSeat } from './PlayerSeat';
import { BotSeat } from './BotSeat';
import { ActionBar } from './ActionBar';
import { TableFelt } from './TableFelt';
import { RulesPanel } from './RulesPanel';
import { SettingsPopover } from './SettingsPopover';
import { RoomInfoPill } from './RoomInfoPill';
import { GinRummyShowdown, type GinRummyShowdownPlayer } from './GinRummyShowdown';
import { WinCelebration } from './WinCelebration';
import { Phase10Objective } from './Phase10Objective';
import { Phase10HandScore } from './Phase10HandScore';
import { MeldsArea, type MeldGroup } from './MeldsArea';
import { Phase10HitTargetModal, type Phase10HitTarget } from './Phase10HitTargetModal';
import { canPhase10HitMeld } from '@/utils/phase10HitRules';
import { CribbagePegArea } from './CribbagePegArea';
import { CribbageBoard } from './cribbage/CribbageBoard';
import { CribbageCountingDisplay } from './CribbageCountingDisplay';
import { CribbagePhaseToast } from './CribbagePhaseToast';
import { sortByRank, sortBySuit, applyHandOrder } from '@/utils/handSort';
import { formatScore } from '@/utils/formatScore';
import { knockEligibility } from '@/utils/ginrummyDeadwood';
import { loadRulesForGame } from '@/utils/gameRules';
import { TableChat } from '../chat/TableChat';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import type { Card } from '@shared/cards';
import type { GameActionPayload } from '@shared/socket';
import en from '@/i18n/en.json';
import { getRoom, deleteRoom } from '@/api/rooms.api';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../shared/Toast';

interface GameTableProps {
  roomId: string;
}

const FELT_W = 880;
const FELT_H = 520;

export function GameTable({ roomId }: GameTableProps) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const gameState = useGameStore(s => s.gameState);
  const selectedCardIds = useGameStore(s => s.selectedCardIds);
  const activeBots = useGameStore(s => s.activeBots);
  const selectCard = useGameStore(s => s.selectCard);
  const deselectCard = useGameStore(s => s.deselectCard);
  const clearSelection = useGameStore(s => s.clearSelection);
  const connectionStatus = useGameStore(s => s.connectionStatus);
  const handOrderMap = useGameStore(s => s.handOrder);
  const setHandOrder = useGameStore(s => s.setHandOrder);

  const { player } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Host resolution — cribbage/etc don't expose hostId in publicData, so fetch
  // the room metadata once on mount. Used to gate the "End game" button.
  const [hostId, setHostId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getRoom(roomId)
      .then((r) => { if (!cancelled) setHostId(r.hostId); })
      .catch((err) => logger.debug('GameTable: getRoom failed', { err }));
    return () => { cancelled = true; };
  }, [roomId]);

  const [endingGame, setEndingGame] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const handleEndGameRequest = useCallback(() => {
    if (endingGame) return;
    setEndConfirmOpen(true);
  }, [endingGame]);
  const handleEndGameConfirm = useCallback(async () => {
    setEndConfirmOpen(false);
    if (endingGame) return;
    setEndingGame(true);
    try {
      await deleteRoom(roomId);
      navigate('/lobby', { replace: true });
    } catch (err) {
      logger.warn('GameTable: deleteRoom failed', { err });
      toast('Could not end the game. Try again.', 'error');
      setEndingGame(false);
    }
  }, [endingGame, roomId, navigate, toast]);

  // Bot activation announcer
  const [botAnnouncement, setBotAnnouncement] = useState('');
  const prevBotIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(activeBots.map(b => b.playerId));
    const prevIds = prevBotIdsRef.current;

    activeBots.forEach(bot => {
      if (!prevIds.has(bot.playerId)) {
        setBotAnnouncement(
          en.table.botTakeover.replace('{name}', bot.displayName),
        );
      }
    });

    prevIds.forEach(id => {
      if (!currentIds.has(id)) {
        const returned = gameState?.players.find(p => p.playerId === id);
        if (returned) {
          setBotAnnouncement(
            en.table.botReturned.replace('{name}', returned.displayName),
          );
        }
      }
    });

    prevBotIdsRef.current = currentIds;
  }, [activeBots, gameState]);

  // Subscribe to game socket events
  useGameState(roomId);
  useGameError(roomId);

  // Cribbage auto-Go: if it's my turn during pegging and I have no playable
  // card (every card would push the count over 31), emit 'go' automatically.
  // Tracked by state version so we only fire once per state.
  const autoGoFiredRef = useRef<number>(-1);

  // DnD sensors — PointerSensor needs a short distance so click-to-select
  // still works without accidentally triggering a drag. KeyboardSensor uses
  // the sortable-preset coordinate getter because drags of hand cards are
  // sortable operations.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!gameState || !player) return;
    if (gameState.gameId !== 'cribbage') return;
    const pd = gameState.publicData as Record<string, unknown>;
    if (pd['gamePhase'] !== 'pegging') return;
    if (gameState.currentTurn !== player.id) return;
    if (autoGoFiredRef.current === gameState.version) return;
    const me = gameState.players.find(p => p.playerId === player.id);
    if (!me || me.hand.length === 0) return;
    const pegCount = (pd['pegCount'] as number | undefined) ?? 0;
    const cardVal = (rank: string | undefined) =>
      !rank ? 0 : rank === 'A' ? 1 : ['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank, 10);
    const playable = me.hand.some(c => cardVal(c.rank) + pegCount <= 31);
    if (playable) return;
    autoGoFiredRef.current = gameState.version;
    const t = window.setTimeout(() => {
      const socket = getGameSocket();
      socket.emit('game_action', {
        roomId,
        action: { type: 'go' },
      } satisfies GameActionPayload);
      logger.debug('GameTable: auto-Go emitted', { version: gameState.version });
    }, 400);
    return () => window.clearTimeout(t);
  }, [gameState, player, roomId]);

  // Keyboard shortcuts at the table level
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') {
        clearSelection();
      }
      if (e.key === 'd' || e.key === 'D') {
        // Discard selected card via keyboard
        if (selectedCardIds.length > 0 && gameState?.currentTurn === player?.id) {
          const socket = getGameSocket();
          const payload: GameActionPayload = {
            roomId,
            action: { type: 'discard', cardIds: selectedCardIds },
          };
          socket.emit('game_action', payload);
          logger.debug('GameTable: keyboard discard', { selectedCardIds });
          clearSelection();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, selectedCardIds, gameState, player, roomId]);

  // Phase 10: hit-meld target modal state. A drop onto a specific meld goes
  // straight to the engine; a click on "Hit Meld" without a specific target
  // opens this modal so the player picks one.
  const [hitModalOpen, setHitModalOpen] = useState(false);

  // Unified drag-end. Three cases:
  //   1. Reorder  — `over.id` is another of the local player's hand card ids
  //   2. Discard  — `over.id === 'discard-pile'`
  //   3. Hit meld — `over.id` starts with `meld:<playerId>:<groupIndex>`
  // HandComponent no longer owns its own DndContext, so this handler is the
  // single entry point for every sortable / droppable in the table.
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { over, active } = event;
      if (!over || !active.id) return;
      const activeId = active.id as string;
      const overId = over.id as string;

      // 1. Reorder the local player's hand.
      if (player && gameState) {
        const me = gameState.players.find(p => p.playerId === player.id);
        const handIds = me?.hand.map(c => c.id) ?? [];
        if (handIds.includes(activeId) && handIds.includes(overId) && activeId !== overId) {
          const oldIndex = handIds.indexOf(activeId);
          const newIndex = handIds.indexOf(overId);
          setHandOrder(roomId, arrayMove(handIds, oldIndex, newIndex));
          return;
        }
      }

      // 2. Drop on the discard pile.
      if (overId === 'discard-pile') {
        const socket = getGameSocket();
        const payload: GameActionPayload = {
          roomId,
          action: { type: 'discard', cardIds: [activeId] },
        };
        socket.emit('game_action', payload);
        logger.debug('GameTable: drag discard', { cardId: activeId });
        clearSelection();
        return;
      }

      // 3. Drop on a Phase 10 meld group. `over.id` encodes
      //    `meld:<targetPlayerId>:<groupIndex>` (set by MeldsArea).
      if (overId.startsWith('meld:')) {
        const parts = overId.split(':');
        const targetPlayerId = parts.slice(1, -1).join(':'); // playerIds can contain ':'
        const groupIndex = Number(parts[parts.length - 1]);
        if (!targetPlayerId || Number.isNaN(groupIndex)) return;

        // Pre-validate against Phase 10 rules so an illegal drop doesn't
        // produce a game_error toast after the round-trip. The engine
        // still re-validates on its side — this is purely UX.
        if (gameState) {
          const pdLaid = (gameState.publicData['laidDownPhases'] as
            | Record<string, Array<{ type: 'set' | 'run' | 'color'; cardIds: string[]; cards?: Card[] }>>
            | undefined) ?? {};
          const targetGroup = pdLaid[targetPlayerId]?.[groupIndex];
          const draggedCard = myPlayer?.hand.find((c) => c.id === activeId);
          if (targetGroup && draggedCard) {
            const existingCards = (targetGroup.cards ?? targetGroup.cardIds
              .map((id) => cardCatalogue[id])
              .filter((c): c is Card => !!c));
            if (!canPhase10HitMeld(draggedCard, targetGroup.type, existingCards)) {
              logger.debug('GameTable: drag hit-meld rejected by client rules', {
                cardId: activeId, targetPlayerId, groupIndex, type: targetGroup.type,
              });
              return;
            }
          }
        }

        const socket = getGameSocket();
        const payload: GameActionPayload = {
          roomId,
          action: {
            type: 'hit-meld',
            payload: { targetPlayerId, groupIndex, cardIds: [activeId] },
          },
        };
        socket.emit('game_action', payload);
        logger.debug('GameTable: drag hit-meld', { cardId: activeId, targetPlayerId, groupIndex });
        clearSelection();
        return;
      }
    },
    [roomId, clearSelection, player, gameState, setHandOrder],
  );

  const handleCardSelect = useCallback(
    (cardId: string) => {
      // Cribbage pegging: clicking a card plays it directly (no select + Play).
      if (gameState?.gameId === 'cribbage') {
        const pd = gameState.publicData as Record<string, unknown> | undefined;
        const phase = pd?.['gamePhase'] as string | undefined;
        if (phase === 'pegging' && gameState.currentTurn === player?.id) {
          const me = gameState.players.find(p => p.playerId === player?.id);
          const card = me?.hand.find(c => c.id === cardId);
          if (card) {
            const pegCount = (pd?.['pegCount'] as number | undefined) ?? 0;
            const v = !card.rank
              ? 0
              : card.rank === 'A'
                ? 1
                : ['J', 'Q', 'K'].includes(card.rank)
                  ? 10
                  : parseInt(card.rank, 10);
            if (pegCount + v <= 31) {
              const socket = getGameSocket();
              socket.emit('game_action', {
                roomId,
                action: { type: 'play', cardIds: [cardId] },
              } satisfies GameActionPayload);
              logger.debug('GameTable: click-to-play', { cardId });
              clearSelection();
              return;
            }
          }
        }
      }
      if (selectedCardIds.includes(cardId)) {
        deselectCard(cardId);
      } else {
        selectCard(cardId);
      }
    },
    [selectedCardIds, selectCard, deselectCard, gameState, player, roomId, clearSelection],
  );

  // Visually-hidden bot activation announcer (always rendered for screen readers)
  const botAnnouncerEl = (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {botAnnouncement}
    </div>
  );

  if (!gameState) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        {botAnnouncerEl}
        {en.app.loading}
      </div>
    );
  }

  const myPlayer = player
    ? gameState.players.find(p => p.playerId === player.id)
    : null;
  const otherPlayers = gameState.players.filter(p => p.playerId !== player?.id);
  const isMyTurn = gameState.currentTurn === player?.id;

  // Cribbage discarding is logically parallel — every player can drop crib
  // cards at the same time. Allow hand interaction regardless of turn while
  // this player still owes a discard.
  const isCribbageDiscarding =
    gameState.gameId === 'cribbage' &&
    (gameState.publicData['gamePhase'] as string | undefined) === 'discarding';
  const cribNeededForHand = gameState.players.length === 2 ? 2 : 1;
  const myDiscardedSoFar =
    ((gameState.publicData['discardedCount'] as Record<string, number> | undefined) ?? {})[
      player?.id ?? ''
    ] ?? 0;
  const canStillDiscardCrib = isCribbageDiscarding && myDiscardedSoFar < cribNeededForHand;
  const handInteractive = isMyTurn || canStillDiscardCrib;

  // Public data fields
  const drawPileCount =
    (gameState.publicData['drawPileSize'] as number | undefined) ??
    (gameState.publicData['drawPileCount'] as number | undefined) ??
    0;
  const topDiscard =
    (gameState.publicData['discardTop'] as Card | null | undefined) ??
    (gameState.publicData['topDiscard'] as Card | null | undefined) ??
    null;

  // Player names for cribbage board
  const playerNames = Object.fromEntries(
    gameState.players.map(p => [p.playerId, p.displayName]),
  );

  const isCribbage = gameState.gameId === 'cribbage';

  // Dealer resolution: cribbage keeps dealerIndex in publicData; other games
  // that rotate a dealer mark players via `isDealer`. Either source drives
  // the badge + "Dealer: X" banner.
  const dealerIndex = isCribbage
    ? ((gameState.publicData['dealerIndex'] as number | undefined) ?? -1)
    : -1;
  const dealerId =
    dealerIndex >= 0
      ? gameState.players[dealerIndex]?.playerId
      : gameState.players.find(p => p.isDealer)?.playerId;
  const dealerName = dealerId
    ? (gameState.players.find(p => p.playerId === dealerId)?.displayName ?? '')
    : '';

  // Turn banner: named indicator of whose turn it is right now. During the
  // cribbage show, the "current turn" is whoever is counting their hand.
  const turnPlayer = gameState.currentTurn
    ? gameState.players.find(p => p.playerId === gameState.currentTurn)
    : null;
  const turnBannerText = turnPlayer
    ? turnPlayer.playerId === player?.id
      ? en.table.turnBannerSelf
      : en.table.turnBannerOther.replace('{name}', turnPlayer.displayName)
    : '';

  // Build a card catalogue (id → Card) from all visible cards so MeldsArea
  // can render laid-down groups for any rummy-family game. Three sources:
  //   1. Every player's hand (covers cards not yet melded).
  //   2. Phase 10's `laidDownPhases[playerId][i].cards` — the engine
  //      attaches a `cards` array to each meld; we mirror it on hit-meld
  //      so the catalogue contains every card placed onto a meld
  //      (including hits — see Phase10Engine.handleHitMeld).
  //   3. Canasta's `melds[side][i].cards` — same shape, side-keyed.
  //   4. Rummy's `melds[i].cards` with playerId per meld.
  const laidDownPhases = (gameState.publicData['laidDownPhases'] as
    | Record<string, Array<{ type: MeldGroup['type']; cardIds: string[]; cards?: Card[] }>>
    | undefined) ?? {};
  const cardCatalogue: Record<string, Card> = {};
  for (const p of gameState.players) {
    for (const c of p.hand) cardCatalogue[c.id] = c;
  }
  for (const groups of Object.values(laidDownPhases)) {
    for (const g of groups) {
      if (g.cards) for (const c of g.cards) cardCatalogue[c.id] = c;
    }
  }
  // Canasta + Rummy meld card sources (each game keeps its own shape).
  // Canasta melds carry canasta-completion metadata (isCanasta flag +
  // canastaType) so the UI can collapse them into a single-pile badge.
  const canastaSideMelds = gameState.gameId === 'canasta'
    ? ((gameState.publicData['melds'] as
        | Record<
            string,
            Array<{
              rank: string;
              cards?: Card[];
              isCanasta?: boolean;
              canastaType?: 'natural' | 'mixed';
            }>
          >
        | undefined) ?? {})
    : {};
  for (const sideMelds of Object.values(canastaSideMelds)) {
    for (const m of sideMelds) {
      if (m.cards) for (const c of m.cards) cardCatalogue[c.id] = c;
    }
  }
  const rummyMelds = gameState.gameId === 'rummy'
    ? ((gameState.publicData['melds'] as
        | Array<{ playerId: string; cards: Card[] }>
        | undefined) ?? [])
    : [];
  for (const m of rummyMelds) {
    for (const c of m.cards) cardCatalogue[c.id] = c;
  }

  /**
   * Unified accessor: for any rummy-family game, return the player's
   * laid-down melds in the MeldGroup shape MeldsArea expects. Each game
   * owns its own publicData shape, so the mapping happens here.
   *   - Phase 10: `laidDownPhases[playerId]` of {type, cardIds}
   *   - Canasta:  `melds[mySide]` of {rank, cards}; we infer side from
   *               the player's seat index for 4p (A=0/2, B=1/3) and use
   *               playerId as side for 2p/3p.
   *   - Rummy:    `melds` array filtered by playerId
   */
  const meldsByPlayer = (playerId: string): MeldGroup[] => {
    if (gameState.gameId === 'phase10') {
      const groups = laidDownPhases[playerId] ?? [];
      return groups.map((g) => ({ type: g.type, cardIds: g.cardIds }));
    }
    if (gameState.gameId === 'canasta') {
      const variant = gameState.publicData['variant'] as '2p' | '3p' | '4p' | undefined;
      let side: string = playerId;
      if (variant === '4p') {
        const idx = gameState.players.findIndex((p) => p.playerId === playerId);
        side = idx === 0 || idx === 2 ? 'A' : 'B';
      }
      const sideMelds = canastaSideMelds[side] ?? [];
      // Canasta melds are sets-only (no runs); render as 'set'. We also
      // propagate the canasta-completion metadata so MeldsArea can
      // collapse 7+ card melds into a single badge+pile rather than a
      // long fan of cards.
      return sideMelds.map((m) => ({
        type: 'set' as const,
        cardIds: (m.cards ?? []).map((c) => c.id),
        isCanasta: m.isCanasta ?? false,
        canastaType: m.canastaType,
      }));
    }
    if (gameState.gameId === 'rummy') {
      return rummyMelds
        .filter((m) => m.playerId === playerId)
        .map((m) => ({
          // Rummy melds can be sets or runs — we don't track which on
          // the wire today, so render as 'set' (the badge is decorative).
          type: 'set' as const,
          cardIds: m.cards.map((c) => c.id),
        }));
    }
    return [];
  };

  // Rummy family — opponents' melds render at 33% so the felt stays readable.
  // Everything on this list shares the same "meld cards visible to all but
  // only the local hand is full-size" aesthetic.
  const RUMMY_FAMILY = new Set(['rummy', 'ginrummy', 'canasta', 'phase10']);
  const isRummyFamily = RUMMY_FAMILY.has(gameState.gameId);

  // Phase 10 hit-meld eligibility. A group is offered as a drop target
  // only if EVERY selected card can legally extend it per the Phase 10
  // rules (sets require matching rank, runs require adjacent value and
  // no duplicates, colours require matching colour — see
  // `utils/phase10HitRules.ts` which mirrors the engine). Previously
  // every group was offered and the engine rejected invalid drops with
  // a game_error toast; now the UI pre-filters so the user only sees
  // targets their selection can actually hit.
  // Only players who've already laid down their own phase are allowed to hit,
  // and only targets (including themselves) who have laid down expose melds
  // that can be extended.
  const phase10HitTargets: Phase10HitTarget[] = (() => {
    if (gameState.gameId !== 'phase10' || !myPlayer || !myPlayer.phaseLaidDown) return [];
    const selectedCards = selectedCardIds
      .map(id => myPlayer.hand.find(c => c.id === id))
      .filter((c): c is Card => !!c);
    if (selectedCards.length === 0) return [];
    if (selectedCards.some(c => c.phase10Type === 'skip')) return [];
    const targets: Phase10HitTarget[] = [];
    for (const targetId of Object.keys(laidDownPhases)) {
      const groups = laidDownPhases[targetId] ?? [];
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi]!;
        const cards = g.cardIds
          .map(id => cardCatalogue[id])
          .filter((c): c is Card => !!c);
        // Only surface the meld as a target if every selected card can hit.
        const allCanHit = selectedCards.every((sc) => canPhase10HitMeld(sc, g.type, cards));
        if (!allCanHit) continue;
        const ownerName =
          targetId === player?.id
            ? 'You'
            : playerNames[targetId] ?? targetId;
        targets.push({
          targetPlayerId: targetId,
          targetPlayerName: ownerName,
          groupIndex: gi,
          type: g.type,
          cards,
        });
      }
    }
    return targets;
  })();

  const handleHitRequest = useCallback(() => {
    if (phase10HitTargets.length === 0) return;
    setHitModalOpen(true);
  }, [phase10HitTargets.length]);

  const handleHitPick = useCallback(
    (target: Phase10HitTarget) => {
      setHitModalOpen(false);
      if (selectedCardIds.length === 0) return;
      const socket = getGameSocket();
      socket.emit('game_action', {
        roomId,
        action: {
          type: 'hit-meld',
          payload: {
            targetPlayerId: target.targetPlayerId,
            groupIndex: target.groupIndex,
            cardIds: [...selectedCardIds],
          },
        },
      } satisfies GameActionPayload);
      clearSelection();
    },
    [roomId, selectedCardIds, clearSelection],
  );

  const actionBarProps = myPlayer ? (() => {
    const cribbagePhase = isCribbage
      ? (gameState.publicData['gamePhase'] as
          | 'discarding' | 'cutting' | 'pegging' | 'counting' | 'ended' | undefined)
      : undefined;
    const cribNeeded = gameState.players.length === 2 ? 2 : 1;
    const discardedCounts = (gameState.publicData['discardedCount'] as
      | Record<string, number> | undefined) ?? {};
    const cribRemaining = isCribbage && player
      ? Math.max(0, cribNeeded - (discardedCounts[player.id] ?? 0))
      : 0;
    const abDealerIdx = isCribbage
      ? ((gameState.publicData['dealerIndex'] as number | undefined) ?? 0)
      : 0;
    const countingStep = isCribbage
      ? (gameState.publicData['countingStep'] as 'hand' | 'crib' | undefined)
      : undefined;
    const currentCountPlayerId = isCribbage
      ? (gameState.publicData['currentCountPlayerId'] as string | undefined)
      : undefined;
    const abDealerId = gameState.players[abDealerIdx]?.playerId;
    const counterName = isCribbage && currentCountPlayerId
      ? (playerNames[currentCountPlayerId] ?? currentCountPlayerId)
      : '';
    const ginrummyKnock = gameState.gameId === 'ginrummy' && myPlayer
      ? {
          ...knockEligibility(myPlayer.hand),
          turnPhase:
            ((gameState.publicData['turnPhase'] as 'draw' | 'discard' | undefined) ?? 'draw'),
        }
      : undefined;

    const sd = gameState.gameId === 'ginrummy'
      ? (gameState.publicData['showdown'] as
          | { active: boolean; acked: string[]; players: Array<{ playerId: string; displayName: string; isBot: boolean }> }
          | undefined)
      : undefined;
    const ginrummyShowdown = sd?.active && player
      ? {
          active: true,
          iHaveAcked: sd.acked.includes(player.id),
          waitingOn: sd.players
            .filter(p => !p.isBot && !sd.acked.includes(p.playerId))
            .map(p => p.displayName),
        }
      : undefined;

    const onlySelectedRank =
      selectedCardIds.length === 1 && myPlayer
        ? myPlayer.hand.find(c => c.id === selectedCardIds[0])?.rank
        : undefined;

    // Canasta: derive the meld / discard bar inputs. Figure out the player's
    // "side" (team key for 4p, playerId otherwise), project the selected
    // cards to their actual Card objects (so the bar can tell wild from
    // natural), and build a list of existing melds on the side that a
    // wild-only selection could extend.
    let canastaProps: {
      phase: 'draw' | 'meld-discard' | 'ended';
      selectedCards: Array<{ id: string; rank?: string; suit?: string }>;
      extendableMelds: Array<{ rank: string; naturals: number; wilds: number; isCanasta: boolean }>;
    } | undefined;
    if (gameState.gameId === 'canasta' && myPlayer && player) {
      const pd = gameState.publicData as Record<string, unknown>;
      const variant = pd['variant'] as '2p' | '3p' | '4p' | undefined;
      let mySide: string;
      if (variant === '4p') {
        const idx = gameState.players.findIndex(p => p.playerId === player.id);
        mySide = idx === 0 || idx === 2 ? 'A' : 'B';
      } else {
        mySide = player.id;
      }
      const melds =
        (pd['melds'] as
          | Record<string, Array<{ rank: string; naturals: number; wilds: number; isCanasta: boolean; blackThrees?: boolean }>>
          | undefined) ?? {};
      const sideMelds = melds[mySide] ?? [];
      const extendableMelds = sideMelds
        .filter((m) => !m.blackThrees)
        .map((m) => ({
          rank: m.rank,
          naturals: m.naturals,
          wilds: m.wilds,
          isCanasta: m.isCanasta,
        }));
      const selectedCards = selectedCardIds
        .map((id) => myPlayer.hand.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => c !== undefined)
        .map((c) => ({ id: c.id, rank: c.rank, suit: c.suit }));
      const phase = (pd['gamePhase'] as 'draw' | 'meld-discard' | 'ended' | undefined) ?? 'draw';
      canastaProps = { phase, selectedCards, extendableMelds };
    }

    const phase10LaidDown =
      gameState.gameId === 'phase10' && !!myPlayer.phaseLaidDown;

    return {
      roomId,
      isMyTurn,
      selectedCardIds,
      gameId: gameState.gameId,
      cribbagePhase,
      cribRemaining,
      countingStep,
      currentCountPlayerId,
      dealerPlayerId: abDealerId,
      dealerName: abDealerId ? (playerNames[abDealerId] ?? '') : '',
      myPlayerId: player?.id,
      counterName,
      ginrummyKnock,
      ginrummyShowdown,
      selectedCardRank: onlySelectedRank,
      canasta: canastaProps,
      phase10LaidDown,
      onPhase10HitRequest: phase10LaidDown ? handleHitRequest : undefined,
    };
  })() : null;

  const ginrummyShowdownData = gameState.gameId === 'ginrummy'
    ? (gameState.publicData['showdown'] as
        | {
            active: boolean;
            knockerId: string;
            isGin: boolean;
            knockerPts: number;
            oppPts: number;
            isUndercut: boolean;
            players: GinRummyShowdownPlayer[];
            acked: string[];
          }
        | undefined)
    : undefined;

  const radialItems = [
    ...(myPlayer ? [{ kind: 'self' as const, player: myPlayer }] : []),
    ...otherPlayers.map(p => ({ kind: 'opponent' as const, player: p })),
  ];

  const totalHands = (gameState.publicData['totalHands'] as number | undefined) ?? 1;
  const currentHand = (gameState.publicData['currentHand'] as number | undefined) ?? 1;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="relative flex flex-col lg:flex-row min-h-screen bg-paper font-sans text-ink">
        {botAnnouncerEl}

        <div className="relative flex-1 min-w-0">
          {/* Floating chrome — top-left: room info + turn banner.
              On `lg` (1440+) absolutely pinned over the felt. Below `lg`
              relative at the top of the flow so it doesn't overlap the
              opponent rail. */}
          <div className="lg:absolute lg:top-5 lg:left-6 relative px-3 sm:px-6 pt-3 z-raised flex flex-row lg:flex-col items-start gap-2 flex-wrap">
            <RoomInfoPill
              roomCode={roomId.slice(-6).toUpperCase()}
              currentHand={currentHand}
              totalHands={totalHands}
            />
            {turnBannerText && (
              <div
                aria-live="polite"
                className={[
                  'inline-flex items-center gap-2 self-start px-3 py-1 rounded-full',
                  'bg-paper-raised/85 backdrop-blur border border-hairline',
                  'font-display italic text-sm',
                  isMyTurn ? 'text-ochre animate-turn-pulse' : 'text-ink-soft',
                ].join(' ')}
              >
                <span aria-hidden>{isMyTurn ? '◆' : '○'}</span>
                <span>{turnBannerText}</span>
              </div>
            )}
            {dealerId && (
              <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-paper-raised/75 border border-hairline/70 text-xs text-ochre">
                <span aria-hidden>♦</span>
                <span>
                  {dealerId === player?.id
                    ? en.table.dealerBannerSelf
                    : en.table.dealerBanner.replace('{name}', dealerName)}
                </span>
              </div>
            )}
            {gameState.gameId === 'canasta' && player && (() => {
              // Initial-meld minimum is driven by the side's *pre-hand* score:
              //   < 0    → 15
              //   < 1500 → 50
              //   < 3000 → 90
              //   ≥ 3000 → 120
              // Already-melded sides see a "✓ melded" chip instead.
              const pd = gameState.publicData as Record<string, unknown>;
              const variant = pd['variant'] as '2p' | '3p' | '4p' | undefined;
              const meldKeys = (pd['meldKeys'] as string[] | undefined) ?? [];
              const initialMeldDone =
                (pd['initialMeldDone'] as Record<string, boolean> | undefined) ?? {};
              const scoresPriorHand =
                (pd['scoresPriorHand'] as Record<string, number> | undefined) ?? {};
              let mySide: string | undefined;
              if (variant === '4p') {
                const idx = gameState.players.findIndex(p => p.playerId === player.id);
                mySide = idx === 0 || idx === 2 ? 'A' : 'B';
              } else {
                mySide = player.id;
              }
              if (!mySide || !meldKeys.includes(mySide)) return null;
              if (initialMeldDone[mySide]) {
                return (
                  <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-paper-raised/75 border border-hairline/70 text-xs text-sage">
                    <span aria-hidden>✓</span>
                    <span>{en.table.initialMeldCompleteLabel}</span>
                  </div>
                );
              }
              const prior = scoresPriorHand[mySide] ?? 0;
              const required = prior < 0 ? 15 : prior < 1500 ? 50 : prior < 3000 ? 90 : 120;
              return (
                <div className="inline-flex items-center gap-2 self-start px-3 py-1 rounded-full bg-paper-raised/75 border border-hairline/70 text-xs text-ochre">
                  <span aria-hidden>⚖</span>
                  <span>
                    {en.table.initialMeldNeedsLabel.replace('{n}', String(required))}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Floating chrome — top-right: settings + leave */}
          {(() => {
            // Host can end the game when they're the only human in the room
            // (every other seat is either a bot or marked isBot). This avoids
            // a host nuking an active game other humans are still playing.
            const amHost = !!player && !!hostId && player.id === hostId;
            const activeBotIds = new Set(activeBots.map((b) => b.playerId));
            const otherHumans = gameState.players.filter((p) =>
              p.playerId !== player?.id && !p.isBot && !activeBotIds.has(p.playerId),
            );
            const canEnd = amHost && otherHumans.length === 0;
            return (
              <div className="lg:absolute lg:top-5 lg:right-6 absolute top-3 right-3 z-raised">
                <SettingsPopover onEndGame={canEnd ? handleEndGameRequest : undefined} />
              </div>
            );
          })()}

          {/* Rules drawer — per-game rules sourced from i18n (localizable). */}
          {(() => {
            const rules = loadRulesForGame(gameState.gameId);
            return (
              <RulesPanel
                title={rules?.title ?? gameState.gameId}
                subtitle={rules?.subtitle}
                isOpen={rulesOpen}
                onToggle={() => setRulesOpen(v => !v)}
                sections={rules?.sections ?? []}
                attribution={rules?.attribution}
              />
            );
          })()}

          {/*
            Mobile opponent rail.
            Radial seating only works at `lg` (1440px+) — below that the
            seats would overflow the felt. The rail sits in its OWN band
            above the felt (no absolute positioning on top of the green),
            horizontally-scrollable to reach each opponent, hairline-ruled
            at the bottom so the seating area reads as a distinct zone.
          */}
          <div
            className="lg:hidden relative z-raised pt-2 pb-3 px-3 sm:px-5 overflow-hidden border-b border-hairline/50"
            aria-label={en.table.otherPlayersLabel}
          >
            <div className="no-scrollbar flex flex-row gap-3 overflow-x-auto snap-x snap-mandatory items-start">
              {radialItems
                .filter((i) => i.kind === 'opponent')
                .map((item) => {
                  const p = item.player;
                  const isBot = activeBots.some(b => b.playerId === p.playerId) || p.isBot;
                  const isCurrentTurn = gameState.currentTurn === p.playerId;
                  const melds = meldsByPlayer(p.playerId);
                  return (
                    <div
                      key={p.playerId}
                      className="flex-none snap-start flex flex-col items-center gap-1.5"
                      style={{ minWidth: melds.length > 0 ? 200 : 140 }}
                    >
                      {isBot ? (
                        <BotSeat
                          playerState={p}
                          originalDisplayName={p.displayName}
                          isCurrentTurn={isCurrentTurn}
                          deckType={gameState.gameId === 'phase10' ? 'phase10' : 'standard'}
                          isDealer={dealerId === p.playerId}
                          compact
                        />
                      ) : (
                        <PlayerSeat
                          playerState={p}
                          isCurrentTurn={isCurrentTurn}
                          isSelf={false}
                          deckType={gameState.gameId === 'phase10' ? 'phase10' : 'standard'}
                          isDealer={dealerId === p.playerId}
                          compact
                        />
                      )}
                      {melds.length > 0 && (
                        <MeldsArea
                          groups={melds}
                          cardCatalogue={cardCatalogue}
                          label={`${p.displayName}'s melds`}
                          scale="full"
                          dropTargetPlayerId={
                            gameState.gameId === 'phase10' && myPlayer?.phaseLaidDown
                              ? p.playerId
                              : undefined
                          }
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Main stage — felt + radial opponent seats.
              On `lg` (1440+) the felt takes the classic padded centre and
              the radial seats surround it. Below `lg` the felt occupies a
              relative block between the opponent rail (above) and the
              dock (below); no absolute positioning so there's no overlap. */}
          <div className="lg:absolute lg:inset-0 flex items-center justify-center lg:pt-24 lg:pb-80 py-4 sm:py-6 px-3 sm:px-6 pointer-events-none">
            <div
              className="relative pointer-events-auto w-full max-w-[880px]"
              style={{
                // Fluid at mobile/tablet, pinned to 880×520 at lg+.
                // aspect-ratio keeps the felt shape identical across sizes.
                aspectRatio: `${FELT_W} / ${FELT_H}`,
              }}
            >
              <TableFelt width={FELT_W} height={FELT_H}>
                <div className="absolute inset-0 flex flex-col items-stretch gap-3 px-8 py-6 overflow-hidden">
                  {/* Top band: opponent pills + melds.
                      Rendered INSIDE the felt's flex-col so flex layout
                      physically separates the zones — no matter how many
                      opponents or how long a meld gets, the middle band
                      below is guaranteed free for the draw/discard piles.
                      Capped at 42% of the felt height with overflow-hidden
                      so pathological cases (many canastas, tiny viewport)
                      stay contained. flex-wrap handles 3-4p variants by
                      flowing opponents to a second row when needed. */}
                  <div
                    className="w-full flex flex-row flex-wrap gap-5 items-start justify-center overflow-hidden shrink-0"
                    style={{ maxHeight: '42%' }}
                  >
                    {radialItems
                      .filter((i) => i.kind === 'opponent')
                      .map((item) => {
                        const p = item.player;
                        const melds = meldsByPlayer(p.playerId);
                        const isBot =
                          activeBots.some((b) => b.playerId === p.playerId) || p.isBot;
                        const isCurrentTurn = gameState.currentTurn === p.playerId;
                        return (
                          <div
                            key={p.playerId}
                            className="flex flex-col items-center gap-2 min-w-0"
                          >
                            {isBot ? (
                              <BotSeat
                                playerState={p}
                                originalDisplayName={p.displayName}
                                isCurrentTurn={isCurrentTurn}
                                deckType={gameState.gameId === 'phase10' ? 'phase10' : 'standard'}
                                isDealer={dealerId === p.playerId}
                                compact={isRummyFamily}
                              />
                            ) : (
                              <PlayerSeat
                                playerState={p}
                                isCurrentTurn={isCurrentTurn}
                                isSelf={false}
                                deckType={gameState.gameId === 'phase10' ? 'phase10' : 'standard'}
                                isDealer={dealerId === p.playerId}
                                compact={isRummyFamily}
                              />
                            )}
                            {melds.length > 0 && (
                              <MeldsArea
                                groups={melds}
                                cardCatalogue={cardCatalogue}
                                label={`${p.displayName}'s melds`}
                                scale="medium"
                                dropTargetPlayerId={
                                  gameState.gameId === 'phase10' && myPlayer?.phaseLaidDown
                                    ? p.playerId
                                    : undefined
                                }
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                  {/* Middle band: piles + game-specific content.
                      flex-grow takes whatever vertical space remains after
                      the top meld band, and justify-center keeps the draw/
                      discard pile vertically centred within that region. */}
                  <div className="flex-grow w-full flex flex-col items-center justify-center gap-3 min-h-0">
                  <div className="flex flex-row flex-wrap gap-6 items-center justify-center">
                    <PileComponent
                      type="draw"
                      cardCount={drawPileCount}
                      deckType={gameState.gameId === 'phase10' ? 'phase10' : 'standard'}
                      onClick={() => {
                        if (isMyTurn) {
                          const socket = getGameSocket();
                          socket.emit('game_action', {
                            roomId,
                            action: { type: 'draw', payload: { source: 'deck' } },
                          } satisfies GameActionPayload);
                        }
                      }}
                    />
                    <div className="relative">
                      <PileComponent
                        type="discard"
                        topCard={topDiscard}
                        isDropTarget={true}
                        deckType={gameState.gameId === 'phase10' ? 'phase10' : 'standard'}
                        onClick={() => {
                          if (!isMyTurn) return;
                          const socket = getGameSocket();
                          // Canasta pickup is a distinct action from a stock
                          // draw: the engine needs to know which hand cards
                          // the player plans to meld with the top card. We
                          // forward whatever is currently selected as
                          // useCardIds; if the selection is empty the engine
                          // will return NO_MATCHING_CARD, surfaced as a toast.
                          if (gameState.gameId === 'canasta') {
                            socket.emit('game_action', {
                              roomId,
                              action: {
                                type: 'take-discard',
                                payload: { useCardIds: [...selectedCardIds] },
                              },
                            } satisfies GameActionPayload);
                            return;
                          }
                          socket.emit('game_action', {
                            roomId,
                            action: { type: 'draw', payload: { source: 'discard' } },
                          } satisfies GameActionPayload);
                        }}
                      />
                      {/* Crazy Eights: show the declared suit when a wild
                          is active so the next player knows what to match. */}
                      {(gameState.gameId === 'crazyeights' ||
                        gameState.gameId === 'crazy-eights') &&
                        (() => {
                          const declared = gameState.publicData['declaredSuit'] as
                            | 'spades' | 'hearts' | 'diamonds' | 'clubs' | null
                            | undefined;
                          if (!declared) return null;
                          const glyph: Record<string, string> = {
                            spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
                          };
                          const red = declared === 'hearts' || declared === 'diamonds';
                          return (
                            <div
                              role="status"
                              aria-label={`Declared suit: ${declared}`}
                              className={[
                                'absolute -top-3 -right-3 z-10',
                                'w-9 h-9 rounded-full',
                                'flex items-center justify-center text-xl leading-none',
                                'bg-paper shadow-[0_4px_10px_-2px_rgb(var(--ink)_/_0.35)]',
                                'border border-hairline',
                                red ? 'text-burgundy' : 'text-ink',
                              ].join(' ')}
                            >
                              {glyph[declared]}
                            </div>
                          );
                        })()}
                    </div>
                  </div>

                  {isCribbage &&
                    gameState.publicData['gamePhase'] === 'pegging' && (
                      <CribbagePegArea
                        pegCount={(gameState.publicData['pegCount'] as number) ?? 0}
                        pegCards={(gameState.publicData['pegCards'] as Card[]) ?? []}
                        cutCard={(gameState.publicData['cutCard'] as Card | null) ?? null}
                      />
                    )}

                  {isCribbage && gameState.cribbageBoardState && (
                    <div className="w-full max-w-2xl">
                      <CribbageBoard
                        boardState={gameState.cribbageBoardState}
                        playerNames={playerNames}
                      />
                    </div>
                  )}

                  {isCribbage && (
                    <CribbagePhaseToast
                      phase={gameState.publicData['gamePhase'] as string | undefined}
                    />
                  )}

                  {isCribbage && gameState.publicData['gamePhase'] === 'counting' && (
                    <div className="w-full max-w-3xl">
                      <CribbageCountingDisplay
                        step={(gameState.publicData['countingStep'] as 'hand' | 'crib') ?? 'hand'}
                        cutCard={(gameState.publicData['cutCard'] as Card | null) ?? null}
                        currentCountPlayerId={
                          gameState.publicData['currentCountPlayerId'] as string | undefined
                        }
                        scoringHands={
                          (gameState.publicData['scoringHands'] as Record<string, Card[]>) ?? {}
                        }
                        handScores={
                          (gameState.publicData['handScores'] as Record<string, number>) ?? {}
                        }
                        crib={(gameState.publicData['crib'] as Card[]) ?? []}
                        cribScore={(gameState.publicData['cribScore'] as number) ?? 0}
                        playerNames={playerNames}
                        dealerIndex={(gameState.publicData['dealerIndex'] as number) ?? 0}
                        playerIds={gameState.players.map(p => p.playerId)}
                      />
                    </div>
                  )}
                  </div>
                </div>
              </TableFelt>

              {/* Opponent pills + melds now render inside the felt's
                  flex-col top band (see "Top band" above). The radial
                  layer was removed: with the flex layout enforcing
                  vertical separation between opponents / piles / board
                  content, the absolute ellipse positioning no longer
                  adds anything, and kept producing overlap with the
                  piles whenever the meld strip got tall. */}
            </div>
          </div>

          {/* Game-over celebration — festive overlay shown when the engine
              transitions the hand to phase === 'ended'. Gin Rummy owns its
              own showdown flow (below), so suppress this for ginrummy. */}
          {gameState.phase === 'ended' &&
            !(gameState.gameId === 'ginrummy' && ginrummyShowdownData?.active) &&
            (() => {
              const ranked = [...gameState.players].sort((a, b) => {
                if (a.isOut && !b.isOut) return -1;
                if (!a.isOut && b.isOut) return 1;
                return (a.score ?? 0) - (b.score ?? 0);
              });
              return <WinCelebration ranked={ranked} selfPlayerId={player?.id} />;
            })()}

          {/* Phase 10 per-hand scoring overlay — distinct from the end-of-
              game celebration. Shown between hands so players can see the
              damage before committing to the next deal. Engine stays in
              `phase === 'scoring'` until every seat acks; bots auto-ack. */}
          {gameState.gameId === 'phase10' && gameState.phase === 'scoring' && (() => {
            const pd = gameState.publicData as Record<string, unknown>;
            const activeBotIds = new Set(activeBots.map((b) => b.playerId));
            return (
              <Phase10HandScore
                roomId={roomId}
                myPlayerId={player?.id}
                players={gameState.players.map((p) => ({
                  playerId: p.playerId,
                  displayName: p.displayName,
                  score: p.score,
                  currentPhase: p.currentPhase,
                  phaseLaidDown: p.phaseLaidDown,
                  isBot: p.isBot || activeBotIds.has(p.playerId),
                }))}
                activeBotIds={activeBotIds}
                handWinnerId={pd['handWinnerId'] as string | undefined}
                handScores={(pd['handScores'] as Record<string, number>) ?? {}}
                scoringAcks={(pd['scoringAcks'] as string[]) ?? []}
              />
            );
          })()}

          {ginrummyShowdownData?.active && (
            <div className="absolute left-1/2 -translate-x-1/2 top-24 w-full max-w-4xl px-4 z-20">
              <GinRummyShowdown
                knockerId={ginrummyShowdownData.knockerId}
                isGin={ginrummyShowdownData.isGin}
                knockerPts={ginrummyShowdownData.knockerPts}
                oppPts={ginrummyShowdownData.oppPts}
                isUndercut={ginrummyShowdownData.isUndercut}
                players={ginrummyShowdownData.players}
                myPlayerId={player?.id}
                ackedIds={ginrummyShowdownData.acked}
              />
            </div>
          )}

          {/* Bottom dock — action bar + hand + self identity.
              On `lg` (1440+) absolutely pinned over the felt. Below `lg`
              the dock is a relative block that stacks cleanly under the
              felt, so no overflow, no overlap, no wasted space. */}
          {myPlayer && (
            <div className="lg:absolute lg:bottom-0 lg:left-0 lg:right-0 relative pt-3 pb-4 sm:pb-6 z-dock flex flex-col items-center gap-2 sm:gap-3 px-2 sm:px-4">
              {actionBarProps && <ActionBar {...actionBarProps} />}

              {gameState.gameId === 'phase10' && (
                <Phase10Objective
                  phase={myPlayer.currentPhase ?? 1}
                  laidDown={myPlayer.phaseLaidDown ?? false}
                />
              )}

              <HandComponent
                cards={applyHandOrder(myPlayer.hand, handOrderMap[roomId])}
                selectedIds={selectedCardIds}
                onSelect={handleCardSelect}
                disabled={!handInteractive}
                draggable={isMyTurn}
                onReorder={(ids) => setHandOrder(roomId, ids)}
              />

              <div className="flex flex-row items-center gap-2 sm:gap-3 flex-wrap justify-center max-w-full px-2 min-w-0">
                <div className="inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 rounded-full bg-paper-raised/80 border border-hairline/70 font-display text-sm min-w-0">
                  <span className="text-ink truncate max-w-[10rem] min-w-0" translate="no">{myPlayer.displayName}</span>
                  <span aria-hidden className="text-whisper">·</span>
                  <span className="font-mono text-ochre text-xs tabular-nums" translate="no">
                    {formatScore(myPlayer.score ?? 0)}
                  </span>
                  {dealerId === myPlayer.playerId && (
                    <span
                      title={en.table.dealerBadgeTooltip}
                      className="w-5 h-5 rounded-full bg-ochre text-paper font-bold text-[0.7rem] flex items-center justify-center"
                    >
                      D
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setHandOrder(roomId, sortByRank(myPlayer.hand))}
                  className="min-h-[36px] text-xs font-medium tracking-wide text-ink-soft bg-paper-raised/60 hover:bg-paper-raised border border-hairline/60 hover:border-ochre rounded-full px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi"
                  aria-label={en.table.sortHandByRank}
                >
                  {en.table.sortRankShort}
                </button>
                <button
                  type="button"
                  onClick={() => setHandOrder(roomId, sortBySuit(myPlayer.hand))}
                  className="min-h-[36px] text-xs font-medium tracking-wide text-ink-soft bg-paper-raised/60 hover:bg-paper-raised border border-hairline/60 hover:border-ochre rounded-full px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi"
                  aria-label={en.table.sortHandBySuit}
                >
                  {en.table.sortSuitShort}
                </button>
              </div>

              {meldsByPlayer(myPlayer.playerId).length > 0 && (
                <MeldsArea
                  groups={meldsByPlayer(myPlayer.playerId)}
                  cardCatalogue={cardCatalogue}
                  label="Your melds"
                  dropTargetPlayerId={
                    gameState.gameId === 'phase10' && myPlayer.phaseLaidDown
                      ? myPlayer.playerId
                      : undefined
                  }
                />
              )}
            </div>
          )}
        </div>

        <TableChat roomId={roomId} />

        <Phase10HitTargetModal
          isOpen={hitModalOpen}
          targets={phase10HitTargets}
          onPick={handleHitPick}
          onClose={() => setHitModalOpen(false)}
        />

        <ConfirmDialog
          open={endConfirmOpen}
          title={en.table.endGameConfirmTitle}
          message={en.table.endGameConfirmBody}
          confirmLabel={en.table.endGameConfirmAction}
          cancelLabel={en.table.endGameConfirmCancel}
          destructive
          onConfirm={handleEndGameConfirm}
          onCancel={() => setEndConfirmOpen(false)}
        />
      </div>
    </DndContext>
  );
}
