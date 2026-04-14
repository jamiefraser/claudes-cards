/**
 * Friends API — SPEC.md §25 (Epic 6)
 */
import { apiFetch } from './client';
import type { FriendEntry, FriendRequest } from '@shared/friends';

/** GET /api/v1/friends — list current player's friends. */
export async function getFriends(): Promise<FriendEntry[]> {
  return apiFetch<FriendEntry[]>('/friends');
}

/** POST /api/v1/friends/request — send a friend request to a player. */
export async function sendFriendRequest(toPlayerId: string): Promise<FriendRequest> {
  return apiFetch<FriendRequest>('/friends/request', {
    method: 'POST',
    body: JSON.stringify({ toPlayerId }),
  });
}

/** PATCH /api/v1/friends/request/:id/accept — accept a pending friend request. */
export async function acceptFriendRequest(requestId: string): Promise<FriendEntry> {
  return apiFetch<FriendEntry>(`/friends/request/${requestId}/accept`, {
    method: 'PATCH',
  });
}

/** PATCH /api/v1/friends/request/:id/decline — decline a pending friend request. */
export async function declineFriendRequest(requestId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/friends/request/${requestId}/decline`, {
    method: 'PATCH',
  });
}

/** PATCH /api/v1/friends/:playerId/block — block a player. */
export async function blockPlayer(playerId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/friends/${playerId}/block`, {
    method: 'PATCH',
  });
}

/** DELETE /api/v1/friends/:playerId — remove a friend. */
export async function removeFriend(playerId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/friends/${playerId}`, {
    method: 'DELETE',
  });
}
