/**
 * Rooms API — SPEC.md §25
 * GET /rooms, POST /rooms, GET /rooms/:id, PATCH /rooms/:id, DELETE /rooms/:id
 */
import { apiFetch } from './client';
import type { Room, RoomListQuery, CreateRoomPayload } from '@shared/rooms';

export interface RoomListResponse {
  rooms: Room[];
  total: number;
}

/** GET /api/v1/rooms — list rooms with optional filters. */
export async function getRooms(query: RoomListQuery = {}): Promise<RoomListResponse> {
  const params = new URLSearchParams();
  if (query.gameId) params.set('gameId', query.gameId);
  if (query.status) params.set('status', query.status);
  if (query.asyncMode !== undefined) params.set('asyncMode', String(query.asyncMode));
  if (query.hasSpace !== undefined) params.set('hasSpace', String(query.hasSpace));
  if (query.search) params.set('search', query.search);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const qs = params.toString();
  return apiFetch<RoomListResponse>(`/rooms${qs ? `?${qs}` : ''}`);
}

/** GET /api/v1/rooms/:id — get a single room by ID. */
export async function getRoom(roomId: string): Promise<Room> {
  return apiFetch<Room>(`/rooms/${roomId}`);
}

/** POST /api/v1/rooms — create a new room. */
export async function createRoom(payload: CreateRoomPayload): Promise<Room> {
  return apiFetch<Room>('/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PATCH /api/v1/rooms/:id — update room settings. */
export async function updateRoom(
  roomId: string,
  updates: Partial<Pick<Room, 'name' | 'settings' | 'status'>>,
): Promise<Room> {
  return apiFetch<Room>(`/rooms/${roomId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/** DELETE /api/v1/rooms/:id — close a room (host only). */
export async function deleteRoom(roomId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/rooms/${roomId}`, {
    method: 'DELETE',
  });
}
