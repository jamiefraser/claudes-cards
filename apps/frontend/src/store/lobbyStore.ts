/**
 * lobbyStore — SPEC.md §7
 * Client state for the lobby: rooms, friends, DMs, notifications.
 */
import { create } from 'zustand';
import type { Room, RoomListQuery } from '@shared/rooms';
import type { FriendEntry, FriendRequest, DMInboxEntry, OnlineStatus } from '@shared/friends';
import { logger } from '@/utils/logger';

export interface LobbyStoreState {
  rooms: Room[];
  totalRooms: number;
  filters: RoomListQuery;
  friends: FriendEntry[];
  pendingRequests: FriendRequest[];
  notificationCount: number;
  dmInbox: DMInboxEntry[];
  openDMThreads: string[];

  setRooms: (rooms: Room[], total: number) => void;
  upsertRoom: (room: Room) => void;
  removeRoom: (roomId: string) => void;
  setFilters: (filters: Partial<RoomListQuery>) => void;
  setFriends: (friends: FriendEntry[]) => void;
  updateFriendStatus: (playerId: string, status: OnlineStatus) => void;
  addPendingRequest: (req: FriendRequest) => void;
  incrementNotifications: () => void;
  clearNotifications: () => void;
  openDM: (playerId: string) => void;
  closeDM: (playerId: string) => void;
}

export const useLobbyStore = create<LobbyStoreState>((set, get) => ({
  rooms: [],
  totalRooms: 0,
  filters: {},
  friends: [],
  pendingRequests: [],
  notificationCount: 0,
  dmInbox: [],
  openDMThreads: [],

  setRooms: (rooms, total) => {
    logger.debug('lobbyStore: setRooms', { count: rooms.length, total });
    set({ rooms, totalRooms: total });
  },

  upsertRoom: (room) => {
    const existing = get().rooms;
    const idx = existing.findIndex(r => r.id === room.id);
    if (idx === -1) {
      logger.debug('lobbyStore: upsertRoom (add)', { roomId: room.id });
      set({ rooms: [...existing, room] });
    } else {
      logger.debug('lobbyStore: upsertRoom (update)', { roomId: room.id });
      const updated = [...existing];
      updated[idx] = room;
      set({ rooms: updated });
    }
  },

  removeRoom: (roomId) => {
    logger.debug('lobbyStore: removeRoom', { roomId });
    set(state => ({ rooms: state.rooms.filter(r => r.id !== roomId) }));
  },

  setFilters: (filters) => {
    logger.debug('lobbyStore: setFilters', filters);
    set(state => ({ filters: { ...state.filters, ...filters } }));
  },

  setFriends: (friends) => {
    logger.debug('lobbyStore: setFriends', { count: friends.length });
    set({ friends });
  },

  updateFriendStatus: (playerId, status) => {
    logger.debug('lobbyStore: updateFriendStatus', { playerId, status });
    set(state => ({
      friends: state.friends.map(f =>
        f.playerId === playerId ? { ...f, status } : f
      ),
    }));
  },

  addPendingRequest: (req) => {
    logger.debug('lobbyStore: addPendingRequest', { reqId: req.id });
    set(state => ({
      pendingRequests: [...state.pendingRequests, req],
    }));
  },

  incrementNotifications: () => {
    set(state => ({ notificationCount: state.notificationCount + 1 }));
  },

  clearNotifications: () => {
    set({ notificationCount: 0 });
  },

  openDM: (playerId) => {
    const current = get().openDMThreads;
    if (!current.includes(playerId)) {
      logger.debug('lobbyStore: openDM', { playerId });
      set({ openDMThreads: [...current, playerId] });
    }
  },

  closeDM: (playerId) => {
    logger.debug('lobbyStore: closeDM', { playerId });
    set(state => ({
      openDMThreads: state.openDMThreads.filter(id => id !== playerId),
    }));
  },
}));
