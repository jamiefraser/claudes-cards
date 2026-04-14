/**
 * Messages Service
 *
 * Business logic for direct messages.
 * SPEC.md §16 Epic 5.
 */

import { prisma } from '../db/prisma';
import type { ChatMessage } from '@shared/chat';

interface DMHistoryResult {
  messages: ChatMessage[];
  total: number;
}

/**
 * Retrieves DM history between two players, most recent last.
 */
export async function getDMHistory(
  playerId: string,
  otherPlayerId: string,
  limit = 50,
  offset = 0,
): Promise<DMHistoryResult> {
  const where = {
    type: 'dm' as const,
    OR: [
      { senderId: playerId, recipientId: otherPlayerId },
      { senderId: otherPlayerId, recipientId: playerId },
    ],
  };

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      include: {
        sender: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
      skip: offset,
      take: limit,
    }),
    prisma.message.count({ where }),
  ]);

  return {
    messages: messages.map((msg) => ({
      id: msg.id,
      roomId: msg.roomId ?? '',
      senderId: msg.senderId,
      senderDisplayName: msg.sender.displayName,
      content: msg.content,
      type: 'dm' as const,
      sentAt: msg.createdAt.toISOString(),
    })),
    total,
  };
}

/**
 * Sends a direct message from sender to recipient.
 */
export async function sendDM(
  senderId: string,
  recipientId: string,
  content: string,
): Promise<ChatMessage> {
  if (!content || content.trim() === '') {
    const err = new Error('Message content is required') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  // Verify recipient exists
  const recipient = await prisma.player.findUnique({
    where: { id: recipientId },
    select: { id: true, displayName: true },
  });

  if (!recipient) {
    const err = new Error('Recipient not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const message = await prisma.message.create({
    data: {
      senderId,
      recipientId,
      content: content.trim(),
      type: 'dm',
    },
    include: {
      sender: { select: { displayName: true } },
    },
  });

  return {
    id: message.id,
    roomId: '',
    senderId: message.senderId,
    senderDisplayName: message.sender.displayName,
    content: message.content,
    type: 'dm',
    sentAt: message.createdAt.toISOString(),
  };
}
