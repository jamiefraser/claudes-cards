/**
 * gameStore — SPEC.md §7
 * Client state for an active game table.
 */
import { create } from 'zustand';
import type { Room } from '@shared/rooms';
import type { GameState, GameStateDelta, GamePhase } from '@shared/gameState';
import type { ChatMessage } from '@shared/chat';
import type { BotSeatInfo } from '@shared/bot';
import { logger } from '@/utils/logger';

/**
 * A single meld in the Canasta pickup-staging plan. The first staged meld
 * must include the pile's top card (`includesTop=true`); subsequent melds
 * are additional single-rank groups from hand that contribute toward the
 * initial-meld threshold.
 */
export interface CanastaStagedMeld {
  id: string;
  cards: Array<{ id: string; rank?: string; suit?: string }>;
  includesTop: boolean;
}

/**
 * Canasta pickup-staging UI state. Clicking the discard pile during the
 * draw phase (when an auto-extend isn't available) puts the local player
 * into this mode: the top card is reserved, the player stages one meld at
 * a time, and when the running total crosses the initial-meld threshold
 * the plan auto-submits as a single `take-discard` action. Lives in the
 * store so the pile click in GameTable and the staging UI in ActionBar
 * share one source of truth.
 */
export interface CanastaPickupState {
  active: boolean;
  stagedMelds: CanastaStagedMeld[];
}

export interface GameStoreState {
  room: Room | null;
  gameState: GameState | null;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  phase: GamePhase;
  selectedCardIds: string[];
  chatMessages: ChatMessage[];
  animationLocked: boolean;
  activeBots: BotSeatInfo[];
  soundEnabled: boolean;
  animationSpeed: 'fast' | 'normal' | 'slow';
  colorBlindMode: boolean;
  canastaPickup: CanastaPickupState;
  /** Per-room user-controlled hand ordering (ids in display order). New cards
   * dealt that aren't yet in the order are appended on the right. */
  handOrder: Record<string, string[]>;

  setRoom: (room: Room) => void;
  applySync: (state: GameState) => void;
  applyDelta: (delta: GameStateDelta) => void;
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;
  /**
   * Remove any selected ids that don't appear in `validIds`. Called whenever
   * the local player's hand changes so a selection left over from a previous
   * hand (or from cards that have just been melded/discarded) can't leak into
   * the next action payload. Without this, engines that validate card
   * membership (canasta take-discard, phase10 lay-down, etc.) reject the
   * request with "card not in hand" even though the user's current
   * selection is visually valid.
   */
  pruneSelection: (validIds: readonly string[]) => void;
  /**
   * Enter Canasta pickup mode. Clears any previously staged melds so a
   * cancelled plan can't leak into the new pickup. Called by the pile
   * click in GameTable when a simple auto-extend isn't available.
   */
  startCanastaPickup: () => void;
  /** Replace the pickup-staging plan (called after each Stage Meld click). */
  setCanastaStagedMelds: (melds: CanastaStagedMeld[]) => void;
  /** Exit pickup mode and discard the staged plan. */
  cancelCanastaPickup: () => void;
  setConnectionStatus: (s: 'connected' | 'reconnecting' | 'disconnected') => void;
  addChatMessage: (msg: ChatMessage) => void;
  lockAnimation: () => void;
  unlockAnimation: () => void;
  setBotActive: (playerId: string, active: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setAnimationSpeed: (s: 'fast' | 'normal' | 'slow') => void;
  setColorBlindMode: (v: boolean) => void;
  setHandOrder: (roomId: string, ids: string[]) => void;
  clearHandOrder: (roomId: string) => void;
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  room: null,
  gameState: null,
  connectionStatus: 'connected',
  phase: 'waiting',
  selectedCardIds: [],
  chatMessages: [],
  animationLocked: false,
  activeBots: [],
  soundEnabled: true,
  animationSpeed: 'normal',
  colorBlindMode: false,
  canastaPickup: { active: false, stagedMelds: [] },
  handOrder: {},

  setRoom: (room) => {
    logger.debug('gameStore: setRoom', { roomId: room.id });
    set({ room });
  },

  applySync: (state) => {
    logger.debug('gameStore: applySync', { version: state.version, roomId: state.roomId });
    set({ gameState: state, phase: state.phase });
  },

  applyDelta: (delta) => {
    const current = get().gameState;
    if (!current) {
      logger.warn('gameStore: applyDelta called but no gameState present');
      return;
    }

    // Sequence check: the server stamps `prevVersion` so the client can
    // detect a dropped earlier delta. A strict equality check catches both
    // skipped updates (prevVersion ahead of local) and duplicate/out-of-
    // order deliveries (prevVersion behind). On mismatch we bail; the
    // useGameState hook fires request_resync and the server replies with
    // a fresh snapshot.
    if (typeof delta.prevVersion === 'number' && delta.prevVersion !== current.version) {
      logger.warn('gameStore: applyDelta skipped — version gap', {
        localVersion: current.version,
        deltaPrevVersion: delta.prevVersion,
        deltaVersion: delta.version,
      });
      return;
    }

    // Merge player updates
    let updatedPlayers = current.players;
    if (delta.playerUpdates) {
      updatedPlayers = current.players.map(p => {
        const update = delta.playerUpdates?.[p.playerId];
        return update ? { ...p, ...update } : p;
      });
    }

    const updated: GameState = {
      ...current,
      version: delta.version,
      players: updatedPlayers,
      currentTurn: delta.currentTurn !== undefined ? delta.currentTurn : current.currentTurn,
      phase: delta.phase ?? current.phase,
      // Replace, don't merge: the engine always sends the full publicData on
      // every delta, and merging makes stale fields from the previous hand
      // (e.g. cribbage countingStep, scoringHands) linger across phase
      // transitions. Replacement matches what applySync does.
      publicData: delta.publicData ?? current.publicData,
      updatedAt: delta.updatedAt,
      cribbageBoardState: delta.cribbageBoardState ?? current.cribbageBoardState,
    };

    logger.debug('gameStore: applyDelta', { version: delta.version });
    set({ gameState: updated, phase: updated.phase });
  },

  selectCard: (cardId) => {
    const current = get().selectedCardIds;
    if (!current.includes(cardId)) {
      set({ selectedCardIds: [...current, cardId] });
    }
  },

  deselectCard: (cardId) => {
    set(state => ({
      selectedCardIds: state.selectedCardIds.filter(id => id !== cardId),
    }));
  },

  clearSelection: () => {
    set({ selectedCardIds: [] });
  },

  pruneSelection: (validIds) => {
    const current = get().selectedCardIds;
    if (current.length === 0) return;
    const valid = new Set(validIds);
    const next = current.filter((id) => valid.has(id));
    if (next.length !== current.length) {
      set({ selectedCardIds: next });
    }
  },

  startCanastaPickup: () => {
    set({ canastaPickup: { active: true, stagedMelds: [] } });
  },

  setCanastaStagedMelds: (melds) => {
    set(state => ({
      canastaPickup: { ...state.canastaPickup, stagedMelds: melds },
    }));
  },

  cancelCanastaPickup: () => {
    set({ canastaPickup: { active: false, stagedMelds: [] } });
  },

  setConnectionStatus: (s) => {
    logger.debug('gameStore: setConnectionStatus', { status: s });
    set({ connectionStatus: s });
  },

  addChatMessage: (msg) => {
    set(state => ({ chatMessages: [...state.chatMessages, msg] }));
  },

  lockAnimation: () => {
    set({ animationLocked: true });
  },

  unlockAnimation: () => {
    set({ animationLocked: false });
  },

  setBotActive: (playerId, active) => {
    if (active) {
      const already = get().activeBots.some(b => b.playerId === playerId);
      if (!already) {
        const botInfo: BotSeatInfo = {
          playerId,
          displayName: '',
          seatIndex: -1,
          activatedAt: new Date().toISOString(),
        };
        logger.debug('gameStore: setBotActive (activate)', { playerId });
        set(state => ({ activeBots: [...state.activeBots, botInfo] }));
      }
    } else {
      logger.debug('gameStore: setBotActive (deactivate)', { playerId });
      set(state => ({
        activeBots: state.activeBots.filter(b => b.playerId !== playerId),
      }));
    }
  },

  setSoundEnabled: (v) => {
    logger.debug('gameStore: setSoundEnabled', { enabled: v });
    set({ soundEnabled: v });
  },

  setAnimationSpeed: (s) => {
    logger.debug('gameStore: setAnimationSpeed', { speed: s });
    set({ animationSpeed: s });
  },

  setColorBlindMode: (v) => {
    logger.debug('gameStore: setColorBlindMode', { enabled: v });
    set({ colorBlindMode: v });
  },

  setHandOrder: (roomId, ids) => {
    set(state => ({ handOrder: { ...state.handOrder, [roomId]: ids } }));
  },

  clearHandOrder: (roomId) => {
    set(state => {
      const next = { ...state.handOrder };
      delete next[roomId];
      return { handOrder: next };
    });
  },
}));
