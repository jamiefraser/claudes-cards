/**
 * Friends Service
 *
 * Business logic for the friends social graph.
 * SPEC.md §17 Epic 6.
 */

import { prisma } from '../db/prisma';
import { Prisma } from '@prisma/client';
import type { FriendEntry } from '@shared/friends';

const friendRelationInclude = {
  requester: { select: { displayName: true, avatarUrl: true } },
  addressee: { select: { displayName: true, avatarUrl: true } },
} as const;

type FriendRelationWithPlayers = Prisma.FriendRelationGetPayload<{
  include: {
    requester: { select: { displayName: true; avatarUrl: true } };
    addressee: { select: { displayName: true; avatarUrl: true } };
  };
}>;

/**
 * Lists all accepted friend entries for the requesting player.
 */
export async function listFriends(playerId: string): Promise<FriendEntry[]> {
  const relations = await prisma.friendRelation.findMany({
    where: {
      OR: [
        { requesterId: playerId, status: 'accepted' },
        { addresseeId: playerId, status: 'accepted' },
      ],
    },
    include: {
      requester: { select: { id: true, displayName: true, avatarUrl: true } },
      addressee: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  return relations.map((rel) => {
    const friend = rel.requesterId === playerId ? rel.addressee : rel.requester;
    const friendId = rel.requesterId === playerId ? rel.addresseeId : rel.requesterId;
    return {
      playerId: friendId,
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl,
      status: 'offline' as const,
      currentRoomId: null,
    };
  });
}

/**
 * Sends a friend request from requesterId to toPlayerId.
 */
export async function sendFriendRequest(
  requesterId: string,
  toPlayerId: string,
): Promise<FriendRelationWithPlayers> {
  if (requesterId === toPlayerId) {
    const err = new Error('Cannot send friend request to yourself') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  // Check if a relation already exists in either direction
  const existing = await prisma.friendRelation.findFirst({
    where: {
      OR: [
        { requesterId, addresseeId: toPlayerId },
        { requesterId: toPlayerId, addresseeId: requesterId },
      ],
    },
  });

  if (existing) {
    const err = new Error('Friend relation already exists') as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  return prisma.friendRelation.create({
    data: {
      requesterId,
      addresseeId: toPlayerId,
      status: 'pending',
    },
    include: friendRelationInclude,
  });
}

/**
 * Accepts a friend request. Only the addressee can accept.
 */
export async function acceptFriendRequest(
  id: string,
  playerId: string,
): Promise<FriendRelationWithPlayers | null> {
  const relation = await prisma.friendRelation.findUnique({ where: { id } });

  if (!relation) return null;

  // Only the addressee can accept
  if (relation.addresseeId !== playerId) {
    const err = new Error('Only the recipient can accept a friend request') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  return prisma.friendRelation.update({
    where: { id },
    data: { status: 'accepted' },
    include: friendRelationInclude,
  });
}

/**
 * Blocks a relation. Either party (requester or addressee) can block.
 */
export async function blockFriendRelation(
  id: string,
  playerId: string,
): Promise<FriendRelationWithPlayers | null> {
  const relation = await prisma.friendRelation.findUnique({ where: { id } });

  if (!relation) return null;

  // Only involved parties can block
  if (relation.requesterId !== playerId && relation.addresseeId !== playerId) {
    const err = new Error('Not involved in this relation') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  return prisma.friendRelation.update({
    where: { id },
    data: { status: 'blocked' },
    include: friendRelationInclude,
  });
}

/**
 * Removes a friend relation. Either party can remove.
 */
export async function removeFriend(
  id: string,
  playerId: string,
): Promise<boolean> {
  const relation = await prisma.friendRelation.findUnique({ where: { id } });

  if (!relation) return false;

  if (relation.requesterId !== playerId && relation.addresseeId !== playerId) {
    const err = new Error('Not involved in this relation') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  await prisma.friendRelation.delete({ where: { id } });
  return true;
}
