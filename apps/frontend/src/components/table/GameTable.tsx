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
} from '@dnd-kit/core';
import { useGameStore } from '@/store/gameStore';
import { useGameState } from '@/hooks/useGameState';
import { useAuth } from '@/auth/useAuth';
import { getGameSocket } from '@/hooks/useSocket';
import { logger } from '@/utils/logger';
import { HandComponent } from '../cards/HandComponent';
import { PileComponent } from '../cards/PileComponent';
import { PlayerSeat } from './PlayerSeat';
import { BotSeat } from './BotSeat';
import { ActionBar } from './ActionBar';
import { GameSettingsPanel } from './GameSettingsPanel';
import { Phase10Objective } from './Phase10Objective';
import { MeldsArea, type MeldGroup } from './MeldsArea';
import { CribbagePegArea } from './CribbagePegArea';
import { CribbageBoard } from './cribbage/CribbageBoard';
import { CribbageCountingDisplay } from './CribbageCountingDisplay';
import { sortByRank, sortBySuit, applyHandOrder } from '@/utils/handSort';
import { TableChat } from '../chat/TableChat';
import type { Card } from '@shared/cards';
import type { GameActionPayload } from '@shared/socket';
import en from '@/i18n/en.json';

interface GameTableProps {
  roomId: string;
}

export function GameTable({ roomId }: GameTableProps) {
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

  // Cribbage auto-Go: if it's my turn during pegging and I have no playable
  // card (every card would push the count over 31), emit 'go' automatically.
  // Tracked by state version so we only fire once per state.
  const autoGoFiredRef = useRef<number>(-1);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor),
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

  // Drag end — card dropped on discard pile
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { over, active } = event;
      if (over?.id === 'discard-pile' && active.id) {
        const cardId = active.id as string;
        const socket = getGameSocket();
        const payload: GameActionPayload = {
          roomId,
          action: { type: 'discard', cardIds: [cardId] },
        };
        socket.emit('game_action', payload);
        logger.debug('GameTable: drag discard', { cardId });
        clearSelection();
      }
    },
    [roomId, clearSelection],
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
  // can render laid-down groups. The engine attaches `cards` to each
  // PhaseGroup, so normally we look those up directly.
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
  const meldsByPlayer = (playerId: string): MeldGroup[] => {
    const groups = laidDownPhases[playerId] ?? [];
    return groups.map((g) => ({ type: g.type, cardIds: g.cardIds }));
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col lg:flex-row h-full min-h-screen bg-slate-900">
        {/* Visually-hidden bot activation announcer */}
        {botAnnouncerEl}

        {/* Main column: connection banner handled globally in App.tsx (ConnectionBanner) */}
        <div className="flex-1 min-w-0 flex flex-col">
        {/* Main table area */}
        <div className="flex-1 flex flex-col">
          {/* Turn + dealer banner — always visible so players always know
              whose turn it is and (in games with a dealer) whose crib it is. */}
          {(turnBannerText || dealerId) && (
            <div
              className="flex flex-row flex-wrap gap-x-4 gap-y-1 items-center justify-center px-3 py-2 bg-slate-800/70 border-b border-slate-700 text-sm"
              aria-live="polite"
            >
              {turnBannerText && (
                <span className="text-white font-semibold">
                  <span className="text-indigo-300">●</span>&nbsp;{turnBannerText}
                </span>
              )}
              {dealerId && (
                <span className="text-amber-300">
                  {dealerId === player?.id
                    ? en.table.dealerBannerSelf
                    : en.table.dealerBanner.replace('{name}', dealerName)}
                </span>
              )}
            </div>
          )}

          {/* Opponent seats (top) */}
          <div className="flex flex-row flex-wrap gap-2 sm:gap-3 p-2 sm:p-4 justify-center items-start">
            {otherPlayers.map(p => {
              const isBot = activeBots.some(b => b.playerId === p.playerId) || p.isBot;
              const isCurrentTurn = gameState.currentTurn === p.playerId;
              const melds = meldsByPlayer(p.playerId);
              return (
                <div key={p.playerId} className="flex flex-col items-center gap-2">
                  {isBot ? (
                    <BotSeat
                      playerState={p}
                      originalDisplayName={p.displayName}
                      isCurrentTurn={isCurrentTurn}
                      deckType={gameState.gameId === 'phase10' ? 'phase10' : 'standard'}
                      isDealer={dealerId === p.playerId}
                    />
                  ) : (
                    <PlayerSeat
                      playerState={p}
                      isCurrentTurn={isCurrentTurn}
                      isSelf={false}
                      deckType={gameState.gameId === 'phase10' ? 'phase10' : 'standard'}
                      isDealer={dealerId === p.playerId}
                    />
                  )}
                  {melds.length > 0 && (
                    <MeldsArea
                      groups={melds}
                      cardCatalogue={cardCatalogue}
                      label={`${p.displayName}'s melds`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Center — draw pile, discard pile, cribbage board */}
          <div className="flex flex-col items-center gap-3 sm:gap-4 py-2 sm:py-4 px-2">
            {/* Piles — wrap on narrow screens so cards don't overflow */}
            <div className="flex flex-row flex-wrap gap-3 sm:gap-6 items-center justify-center">
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

              <PileComponent
                type="discard"
                topCard={topDiscard}
                isDropTarget={true}
                deckType={gameState.gameId === 'phase10' ? 'phase10' : 'standard'}
                onClick={() => {
                  if (isMyTurn) {
                    const socket = getGameSocket();
                    socket.emit('game_action', {
                      roomId,
                      action: { type: 'draw', payload: { source: 'discard' } },
                    } satisfies GameActionPayload);
                  }
                }}
              />

              {/* Settings panel */}
              <div className="sm:ml-4">
                <GameSettingsPanel />
              </div>
            </div>

            {/* Cribbage board */}
            {isCribbage && gameState.cribbageBoardState && (
              <div className="w-full max-w-2xl px-1 sm:px-4">
                <CribbageBoard
                  boardState={gameState.cribbageBoardState}
                  playerNames={playerNames}
                />
              </div>
            )}

            {/* Cribbage pegging area (appears during 'pegging' phase) */}
            {isCribbage &&
              gameState.publicData['gamePhase'] === 'pegging' && (
                <CribbagePegArea
                  pegCount={(gameState.publicData['pegCount'] as number) ?? 0}
                  pegCards={(gameState.publicData['pegCards'] as Card[]) ?? []}
                  cutCard={(gameState.publicData['cutCard'] as Card | null) ?? null}
                />
              )}

            {/* Cribbage counting — turn-based show, then crib */}
            {isCribbage && gameState.publicData['gamePhase'] === 'counting' && (
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
            )}
          </div>

          {/* Player hand + own seat */}
          <div className="flex flex-col items-center gap-2 pb-2">
            {myPlayer && (
              <>
                <PlayerSeat
                  playerState={myPlayer}
                  isCurrentTurn={isMyTurn}
                  isSelf={true}
                  isDealer={dealerId === myPlayer.playerId}
                />
                {gameState.gameId === 'phase10' && (
                  <Phase10Objective
                    phase={myPlayer.currentPhase ?? 1}
                    laidDown={myPlayer.phaseLaidDown ?? false}
                  />
                )}
                <div className="flex flex-row gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => setHandOrder(roomId, sortByRank(myPlayer.hand))}
                    className="text-xs text-slate-300 bg-slate-700 hover:bg-slate-600 rounded px-3 py-2 min-h-[36px]"
                    aria-label="Sort hand by rank"
                  >
                    Sort: Rank
                  </button>
                  <button
                    type="button"
                    onClick={() => setHandOrder(roomId, sortBySuit(myPlayer.hand))}
                    className="text-xs text-slate-300 bg-slate-700 hover:bg-slate-600 rounded px-3 py-2 min-h-[36px]"
                    aria-label="Sort hand by suit"
                  >
                    Sort: Suit
                  </button>
                </div>
                <HandComponent
                  cards={applyHandOrder(myPlayer.hand, handOrderMap[roomId])}
                  selectedIds={selectedCardIds}
                  onSelect={handleCardSelect}
                  disabled={!handInteractive}
                  draggable={isMyTurn}
                  onReorder={(ids) => setHandOrder(roomId, ids)}
                />
                {meldsByPlayer(myPlayer.playerId).length > 0 && (
                  <MeldsArea
                    groups={meldsByPlayer(myPlayer.playerId)}
                    cardCatalogue={cardCatalogue}
                    label="Your melds"
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Action bar (bottom) — only for players in the game, not spectators */}
        {myPlayer && (() => {
          const cribbagePhase = isCribbage
            ? (gameState.publicData['gamePhase'] as
                | 'discarding'
                | 'cutting'
                | 'pegging'
                | 'counting'
                | 'ended'
                | undefined)
            : undefined;
          const cribNeeded = gameState.players.length === 2 ? 2 : 1;
          const discardedCounts = (gameState.publicData['discardedCount'] as
            | Record<string, number>
            | undefined) ?? {};
          const cribRemaining = isCribbage && player
            ? Math.max(0, cribNeeded - (discardedCounts[player.id] ?? 0))
            : 0;
          const dealerIndex = isCribbage
            ? ((gameState.publicData['dealerIndex'] as number | undefined) ?? 0)
            : 0;
          const countingStep = isCribbage
            ? (gameState.publicData['countingStep'] as 'hand' | 'crib' | undefined)
            : undefined;
          const currentCountPlayerId = isCribbage
            ? (gameState.publicData['currentCountPlayerId'] as string | undefined)
            : undefined;
          const dealerId = gameState.players[dealerIndex]?.playerId;
          const counterName = isCribbage && currentCountPlayerId
            ? (playerNames[currentCountPlayerId] ?? currentCountPlayerId)
            : '';
          return (
            <ActionBar
              roomId={roomId}
              isMyTurn={isMyTurn}
              selectedCardIds={selectedCardIds}
              gameId={gameState.gameId}
              cribbagePhase={cribbagePhase}
              cribRemaining={cribRemaining}
              countingStep={countingStep}
              currentCountPlayerId={currentCountPlayerId}
              dealerPlayerId={dealerId}
              myPlayerId={player?.id}
              counterName={counterName}
            />
          );
        })()}
        </div>

        {/* Right sidebar: in-game chat (SPEC.md §16 Epic 5) */}
        <TableChat roomId={roomId} />
      </div>
    </DndContext>
  );
}
