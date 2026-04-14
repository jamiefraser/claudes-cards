/**
 * lobbyStore tests — SPEC.md §7 store shape
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useLobbyStore } from '../src/store/lobbyStore';
import type { Room } from '@shared/rooms';
import type { FriendEntry, FriendRequest } from '@shared/friends';

const mockRoom: Room = {
  id: 'room-1',
  gameId: 'phase10',
  name: 'Test Room',
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

const mockFriend: FriendEntry = {
  playerId: 'player-2',
  displayName: 'TestPlayer2',
  avatarUrl: null,
  status: 'online',
  currentRoomId: null,
};

const mockRequest: FriendRequest = {
  id: 'req-1',
  fromPlayerId: 'player-3',
  fromDisplayName: 'TestPlayer3',
  fromAvatarUrl: null,
  toPlayerId: 'player-1',
  sentAt: new Date().toISOString(),
};

// Reset store to initial state before each test
beforeEach(() => {
  useLobbyStore.setState({
    rooms: [],
    totalRooms: 0,
    filters: {},
    friends: [],
    pendingRequests: [],
    notificationCount: 0,
    dmInbox: [],
    openDMThreads: [],
  });
});

describe('lobbyStore', () => {
  it('starts with empty rooms and friends', () => {
    const state = useLobbyStore.getState();
    expect(state.rooms).toEqual([]);
    expect(state.totalRooms).toBe(0);
    expect(state.friends).toEqual([]);
    expect(state.pendingRequests).toEqual([]);
    expect(state.notificationCount).toBe(0);
  });

  it('setRooms stores rooms and total', () => {
    const { setRooms } = useLobbyStore.getState();
    setRooms([mockRoom], 1);
    const state = useLobbyStore.getState();
    expect(state.rooms).toHaveLength(1);
    expect(state.totalRooms).toBe(1);
    expect(state.rooms[0].id).toBe('room-1');
  });

  it('upsertRoom adds new room', () => {
    const { upsertRoom } = useLobbyStore.getState();
    upsertRoom(mockRoom);
    expect(useLobbyStore.getState().rooms).toHaveLength(1);
  });

  it('upsertRoom updates existing room', () => {
    const { setRooms, upsertRoom } = useLobbyStore.getState();
    setRooms([mockRoom], 1);
    const updated: Room = { ...mockRoom, status: 'in-progress' };
    upsertRoom(updated);
    const state = useLobbyStore.getState();
    expect(state.rooms).toHaveLength(1);
    expect(state.rooms[0].status).toBe('in-progress');
  });

  it('removeRoom removes by id', () => {
    const { setRooms, removeRoom } = useLobbyStore.getState();
    setRooms([mockRoom], 1);
    removeRoom('room-1');
    expect(useLobbyStore.getState().rooms).toHaveLength(0);
  });

  it('setFriends stores friends list', () => {
    const { setFriends } = useLobbyStore.getState();
    setFriends([mockFriend]);
    expect(useLobbyStore.getState().friends).toHaveLength(1);
  });

  it('updateFriendStatus changes a single friend status', () => {
    const { setFriends, updateFriendStatus } = useLobbyStore.getState();
    setFriends([mockFriend]);
    updateFriendStatus('player-2', 'in-game');
    expect(useLobbyStore.getState().friends[0].status).toBe('in-game');
  });

  it('addPendingRequest adds to pendingRequests', () => {
    const { addPendingRequest } = useLobbyStore.getState();
    addPendingRequest(mockRequest);
    expect(useLobbyStore.getState().pendingRequests).toHaveLength(1);
  });

  it('incrementNotifications increases count; clearNotifications resets to 0', () => {
    const { incrementNotifications, clearNotifications } = useLobbyStore.getState();
    incrementNotifications();
    incrementNotifications();
    expect(useLobbyStore.getState().notificationCount).toBe(2);
    clearNotifications();
    expect(useLobbyStore.getState().notificationCount).toBe(0);
  });

  it('openDM / closeDM manages open threads', () => {
    const { openDM, closeDM } = useLobbyStore.getState();
    openDM('player-2');
    expect(useLobbyStore.getState().openDMThreads).toContain('player-2');
    closeDM('player-2');
    expect(useLobbyStore.getState().openDMThreads).not.toContain('player-2');
  });

  it('setFilters merges into existing filters', () => {
    const { setFilters } = useLobbyStore.getState();
    setFilters({ gameId: 'phase10' });
    expect(useLobbyStore.getState().filters.gameId).toBe('phase10');
    setFilters({ status: 'waiting' });
    expect(useLobbyStore.getState().filters.gameId).toBe('phase10');
    expect(useLobbyStore.getState().filters.status).toBe('waiting');
  });

  it('openDM does not add duplicate entries', () => {
    const { openDM } = useLobbyStore.getState();
    openDM('player-2');
    openDM('player-2');
    expect(useLobbyStore.getState().openDMThreads).toHaveLength(1);
  });
});
