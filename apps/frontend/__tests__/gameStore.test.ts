/**
 * gameStore tests — SPEC.md §7 store shape
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../src/store/gameStore';
import type { Room } from '@shared/rooms';
import type { GameState } from '@shared/gameState';
import type { ChatMessage } from '@shared/chat';

const mockRoom: Room = {
  id: 'room-1',
  gameId: 'phase10',
  hostId: 'player-1',
  players: [],
  settings: {
    maxPlayers: 4,
    asyncMode: false,
    turnTimerSeconds: null,
    isPrivate: false,
    password: null,
  },
  status: 'waiting',
  createdAt: new Date().toISOString(),
};

const mockState: GameState = {
  version: 1,
  roomId: 'room-1',
  gameId: 'phase10',
  phase: 'playing',
  players: [],
  currentTurn: 'player-1',
  turnNumber: 1,
  roundNumber: 1,
  publicData: {},
  updatedAt: new Date().toISOString(),
};

const mockMsg: ChatMessage = {
  id: 'msg-1',
  roomId: 'room-1',
  senderId: 'player-1',
  senderDisplayName: 'TestPlayer1',
  content: 'Hello',
  type: 'chat',
  sentAt: new Date().toISOString(),
};

// Reset store to initial state before each test
beforeEach(() => {
  useGameStore.setState({
    room: null,
    gameState: null,
    connectionStatus: 'disconnected',
    phase: 'waiting',
    selectedCardIds: [],
    chatMessages: [],
    animationLocked: false,
    activeBots: [],
    soundEnabled: true,
    animationSpeed: 'normal',
    colorBlindMode: false,
  });
});

describe('gameStore', () => {
  it('starts with null room and gameState', () => {
    const state = useGameStore.getState();
    expect(state.room).toBeNull();
    expect(state.gameState).toBeNull();
    expect(state.connectionStatus).toBe('disconnected');
    expect(state.selectedCardIds).toEqual([]);
    expect(state.chatMessages).toEqual([]);
    expect(state.animationLocked).toBe(false);
    expect(state.activeBots).toEqual([]);
    expect(state.soundEnabled).toBe(true);
    expect(state.animationSpeed).toBe('normal');
    expect(state.colorBlindMode).toBe(false);
  });

  it('setRoom stores the room', () => {
    const { setRoom } = useGameStore.getState();
    setRoom(mockRoom);
    expect(useGameStore.getState().room).toEqual(mockRoom);
  });

  it('applySync sets gameState', () => {
    const { applySync } = useGameStore.getState();
    applySync(mockState);
    expect(useGameStore.getState().gameState).toEqual(mockState);
  });

  it('applyDelta updates existing gameState currentTurn', () => {
    const { applySync, applyDelta } = useGameStore.getState();
    applySync(mockState);
    applyDelta({
      version: 2,
      roomId: 'room-1',
      currentTurn: 'player-2',
      updatedAt: new Date().toISOString(),
    });
    expect(useGameStore.getState().gameState?.currentTurn).toBe('player-2');
    expect(useGameStore.getState().gameState?.version).toBe(2);
  });

  it('applyDelta with no existing state is a no-op', () => {
    const { applyDelta } = useGameStore.getState();
    // Should not throw
    applyDelta({
      version: 2,
      roomId: 'room-1',
      updatedAt: new Date().toISOString(),
    });
    expect(useGameStore.getState().gameState).toBeNull();
  });

  it('applyDelta skips when prevVersion does not match current version (gap detected)', () => {
    const { applySync, applyDelta } = useGameStore.getState();
    applySync(mockState); // version = 1
    // A delta claiming to build off version 3 when we're at 1 → gap.
    applyDelta({
      version: 4,
      prevVersion: 3,
      roomId: 'room-1',
      currentTurn: 'player-2',
      updatedAt: new Date().toISOString(),
    });
    // Local state untouched — waiting for a resync snapshot.
    expect(useGameStore.getState().gameState?.version).toBe(1);
    expect(useGameStore.getState().gameState?.currentTurn).toBe('player-1');
  });

  it('applyDelta applies when prevVersion matches current version', () => {
    const { applySync, applyDelta } = useGameStore.getState();
    applySync(mockState); // version = 1
    applyDelta({
      version: 2,
      prevVersion: 1,
      roomId: 'room-1',
      currentTurn: 'player-2',
      updatedAt: new Date().toISOString(),
    });
    expect(useGameStore.getState().gameState?.version).toBe(2);
    expect(useGameStore.getState().gameState?.currentTurn).toBe('player-2');
  });

  it('selectCard / deselectCard / clearSelection manage selectedCardIds', () => {
    const { selectCard, deselectCard, clearSelection } = useGameStore.getState();
    selectCard('card-1');
    selectCard('card-2');
    expect(useGameStore.getState().selectedCardIds).toEqual(['card-1', 'card-2']);
    deselectCard('card-1');
    expect(useGameStore.getState().selectedCardIds).toEqual(['card-2']);
    clearSelection();
    expect(useGameStore.getState().selectedCardIds).toEqual([]);
  });

  it('selectCard does not add duplicates', () => {
    const { selectCard } = useGameStore.getState();
    selectCard('card-1');
    selectCard('card-1');
    expect(useGameStore.getState().selectedCardIds).toHaveLength(1);
  });

  it('pruneSelection removes ids that are not in the valid set', () => {
    // Regression: after a card is melded/discarded or a new hand is dealt,
    // selectedCardIds must not retain stale ids — otherwise engines that
    // validate card membership (canasta take-discard, phase10 lay-down)
    // reject actions with "card not in hand".
    const { selectCard, pruneSelection } = useGameStore.getState();
    selectCard('card-1');
    selectCard('card-2');
    selectCard('card-3');
    pruneSelection(['card-2']);
    expect(useGameStore.getState().selectedCardIds).toEqual(['card-2']);
  });

  it('pruneSelection is a no-op when every selected id is still valid', () => {
    const { selectCard, pruneSelection } = useGameStore.getState();
    selectCard('card-1');
    selectCard('card-2');
    const before = useGameStore.getState().selectedCardIds;
    pruneSelection(['card-1', 'card-2', 'card-3']);
    // Reference equality preserved so no-op calls don't trigger re-renders.
    expect(useGameStore.getState().selectedCardIds).toBe(before);
  });

  it('pruneSelection returns early on an empty selection', () => {
    const { pruneSelection } = useGameStore.getState();
    const before = useGameStore.getState().selectedCardIds;
    pruneSelection(['card-1', 'card-2']);
    expect(useGameStore.getState().selectedCardIds).toBe(before);
  });

  it('setConnectionStatus updates status', () => {
    const { setConnectionStatus } = useGameStore.getState();
    setConnectionStatus('connected');
    expect(useGameStore.getState().connectionStatus).toBe('connected');
    setConnectionStatus('reconnecting');
    expect(useGameStore.getState().connectionStatus).toBe('reconnecting');
  });

  it('addChatMessage appends message', () => {
    const { addChatMessage } = useGameStore.getState();
    addChatMessage(mockMsg);
    expect(useGameStore.getState().chatMessages).toHaveLength(1);
    expect(useGameStore.getState().chatMessages[0].id).toBe('msg-1');
  });

  it('lockAnimation / unlockAnimation toggles animationLocked', () => {
    const { lockAnimation, unlockAnimation } = useGameStore.getState();
    lockAnimation();
    expect(useGameStore.getState().animationLocked).toBe(true);
    unlockAnimation();
    expect(useGameStore.getState().animationLocked).toBe(false);
  });

  it('setBotActive adds a bot entry when active=true', () => {
    const { setBotActive } = useGameStore.getState();
    setBotActive('player-2', true);
    expect(useGameStore.getState().activeBots.some(b => b.playerId === 'player-2')).toBe(true);
  });

  it('setBotActive removes bot entry when active=false', () => {
    const { setBotActive } = useGameStore.getState();
    setBotActive('player-2', true);
    setBotActive('player-2', false);
    expect(useGameStore.getState().activeBots.some(b => b.playerId === 'player-2')).toBe(false);
  });

  it('setBotActive does not add duplicate entries', () => {
    const { setBotActive } = useGameStore.getState();
    setBotActive('player-2', true);
    setBotActive('player-2', true);
    expect(useGameStore.getState().activeBots.filter(b => b.playerId === 'player-2')).toHaveLength(1);
  });

  it('setSoundEnabled toggles sound', () => {
    const { setSoundEnabled } = useGameStore.getState();
    setSoundEnabled(false);
    expect(useGameStore.getState().soundEnabled).toBe(false);
    setSoundEnabled(true);
    expect(useGameStore.getState().soundEnabled).toBe(true);
  });

  it('setAnimationSpeed sets speed', () => {
    const { setAnimationSpeed } = useGameStore.getState();
    setAnimationSpeed('fast');
    expect(useGameStore.getState().animationSpeed).toBe('fast');
    setAnimationSpeed('slow');
    expect(useGameStore.getState().animationSpeed).toBe('slow');
  });

  it('setColorBlindMode sets mode', () => {
    const { setColorBlindMode } = useGameStore.getState();
    setColorBlindMode(true);
    expect(useGameStore.getState().colorBlindMode).toBe(true);
    setColorBlindMode(false);
    expect(useGameStore.getState().colorBlindMode).toBe(false);
  });
});
