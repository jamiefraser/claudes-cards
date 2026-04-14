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
  /** Per-room user-controlled hand ordering (ids in display order). New cards
   * dealt that aren't yet in the order are appended on the right. */
  handOrder: Record<string, string[]>;

  setRoom: (room: Room) => void;
  applySync: (state: GameState) => void;
  applyDelta: (delta: GameStateDelta) => void;
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;
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
      publicData: delta.publicData
        ? { ...current.publicData, ...delta.publicData }
        : current.publicData,
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
