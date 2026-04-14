/**
 * Messages API — SPEC.md §25 (Epic 5)
 */
import { apiFetch } from './client';
import type { ChatMessage } from '@shared/chat';

export interface DMThreadResponse {
  messages: ChatMessage[];
  total: number;
}

/** GET /api/v1/messages/dm/:playerId — fetch DM thread with a player. */
export async function getDMThread(
  playerId: string,
  limit = 50,
  offset = 0,
): Promise<DMThreadResponse> {
  return apiFetch<DMThreadResponse>(
    `/messages/dm/${playerId}?limit=${limit}&offset=${offset}`,
  );
}

/** POST /api/v1/messages/dm/:playerId — send a direct message. */
export async function sendDM(toPlayerId: string, content: string): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/messages/dm/${toPlayerId}`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}
