/**
 * Rooms Service
 *
 * Business logic for room CRUD operations.
 * SPEC.md §14 Epic 3 — Lobby Experience.
 */

import { prisma } from '../db/prisma';
import { Prisma } from '@prisma/client';
import type { Room, CreateRoomPayload } from '@shared/rooms';

interface RoomListResult {
  rooms: Room[];
  total: number;
}

interface RoomListOptions {
  gameId?: string;
  status?: 'waiting' | 'in-progress';
  page?: number;
  limit?: number;
}

/**
 * Maps a Prisma room status to the shared Room status type.
 */
function mapRoomStatus(status: string): Room['status'] {
  switch (status) {
    case 'waiting':
      return 'waiting';
    case 'playing':
      return 'in-progress';
    case 'finished':
      return 'ended';
    default:
      return 'waiting';
  }
}

/**
 * Maps a shared Room status to the Prisma RoomStatus enum value.
 */
function mapToPrismaStatus(status: 'waiting' | 'in-progress'): 'waiting' | 'playing' {
  return status === 'in-progress' ? 'playing' : 'waiting';
}

type RoomWithHost = Prisma.RoomGetPayload<{
  include: { host: { select: { id: true; displayName: true; avatarUrl: true } } };
}>;

function mapRoomToShared(room: RoomWithHost): Room {
  const settings = (room.settings as Record<string, unknown>) ?? {};
  return {
    id: room.id,
    gameId: room.gameId,
    name: room.name,
    hostId: room.hostId,
    players: [
      {
        id: room.host.id,
        displayName: room.host.displayName,
        avatarUrl: room.host.avatarUrl,
      },
    ],
    settings: {
      maxPlayers: typeof settings['maxPlayers'] === 'number' ? settings['maxPlayers'] : 2,
      asyncMode: room.asyncMode,
      turnTimerSeconds: room.turnTimerSeconds,
      isPrivate: typeof settings['isPrivate'] === 'boolean' ? settings['isPrivate'] : false,
      password: typeof settings['password'] === 'string' ? settings['password'] : null,
    },
    status: mapRoomStatus(room.status),
    createdAt: room.createdAt.toISOString(),
  };
}

const roomInclude = {
  host: { select: { id: true, displayName: true, avatarUrl: true } },
} as const;

export async function listRooms(options: RoomListOptions): Promise<RoomListResult> {
  const { gameId, status, page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const where: Prisma.RoomWhereInput = {
    ...(gameId ? { gameId } : {}),
    ...(status ? { status: mapToPrismaStatus(status) } : {}),
  };

  const [rooms, total] = await Promise.all([
    prisma.room.findMany({
      where,
      include: roomInclude,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.room.count({ where }),
  ]);

  return {
    rooms: rooms.map(mapRoomToShared),
    total,
  };
}

export async function createRoom(
  hostId: string,
  payload: CreateRoomPayload,
): Promise<Room> {
  const settingsJson = payload.settings as unknown as Prisma.InputJsonValue;

  const room = await prisma.room.create({
    data: {
      gameId: payload.gameId,
      name: payload.name ?? `${payload.gameId} room`,
      hostId,
      settings: settingsJson,
      asyncMode: payload.settings.asyncMode,
      turnTimerSeconds: payload.settings.turnTimerSeconds,
      status: 'waiting',
    },
    include: roomInclude,
  });

  return mapRoomToShared(room);
}

export async function getRoomById(id: string): Promise<Room | null> {
  const room = await prisma.room.findUnique({
    where: { id },
    include: roomInclude,
  });

  if (!room) return null;
  return mapRoomToShared(room);
}

export async function updateRoom(
  id: string,
  hostId: string,
  updates: { name?: string; settings?: Record<string, unknown> },
): Promise<Room | null> {
  const existing = await prisma.room.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.hostId !== hostId) throw new Error('FORBIDDEN');

  const settingsJson = updates.settings as unknown as Prisma.InputJsonValue | undefined;

  const updated = await prisma.room.update({
    where: { id },
    data: {
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(settingsJson !== undefined
        ? {
            settings: settingsJson,
            ...(updates.settings?.['asyncMode'] !== undefined
              ? { asyncMode: Boolean(updates.settings['asyncMode']) }
              : {}),
            ...(updates.settings?.['turnTimerSeconds'] !== undefined
              ? { turnTimerSeconds: updates.settings['turnTimerSeconds'] as number | null }
              : {}),
          }
        : {}),
    },
    include: roomInclude,
  });

  return mapRoomToShared(updated);
}

export async function deleteRoom(id: string, hostId: string): Promise<boolean> {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return false;
  if (room.hostId !== hostId) throw new Error('FORBIDDEN');

  await prisma.room.delete({ where: { id } });
  return true;
}
