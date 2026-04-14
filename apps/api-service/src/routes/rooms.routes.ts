/**
 * Rooms Routes
 *
 * GET    /api/v1/rooms        — list rooms with filters
 * POST   /api/v1/rooms        — create a room
 * GET    /api/v1/rooms/:id    — get room details
 * PATCH  /api/v1/rooms/:id    — update room settings (host only)
 * DELETE /api/v1/rooms/:id    — delete/close a room (host only)
 *
 * All routes require authentication.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { redis } from '../redis/client';
import {
  listRooms,
  createRoom,
  getRoomById,
  updateRoom,
  deleteRoom,
} from '../services/rooms.service';
import { logger } from '../utils/logger';
import type { CreateRoomPayload, Room } from '@shared/rooms';

export const roomsRouter = Router();

roomsRouter.use(authMiddleware);

/**
 * Write (or overwrite) room:meta:{id} in Redis from a Room record.
 * Used by POST /rooms at creation and by GET /rooms/:id to self-heal after
 * a Redis restart — rooms persist in Postgres but Redis is ephemeral, so
 * a metadata wipe would otherwise force startGame.ts into a wrong fallback.
 */
async function writeRoomMeta(room: Room): Promise<void> {
  try {
    if (redis.status === 'wait') await redis.connect();
    await redis.set(
      `room:meta:${room.id}`,
      JSON.stringify({
        hostId: room.hostId,
        gameId: room.gameId,
        maxPlayers: room.settings.maxPlayers,
      }),
    );
  } catch (e) {
    logger.warn('Failed to write room:meta to Redis', { roomId: room.id, err: String(e) });
  }
}

// GET /api/v1/rooms
roomsRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      gameId,
      status,
      page,
      limit,
    } = req.query as {
      gameId?: string;
      status?: 'waiting' | 'in-progress';
      page?: string;
      limit?: string;
    };

    const result = await listRooms({
      gameId,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    res.json(result);
  } catch (err) {
    logger.error('GET /rooms failed', { err });
    next(err);
  }
});

// POST /api/v1/rooms
roomsRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as Partial<CreateRoomPayload>;

    if (!body.gameId || typeof body.gameId !== 'string') {
      res.status(400).json({ error: 'gameId is required' });
      return;
    }

    if (!body.settings) {
      res.status(400).json({ error: 'settings is required' });
      return;
    }

    const payload: CreateRoomPayload = {
      gameId: body.gameId,
      name: body.name,
      settings: {
        maxPlayers: body.settings.maxPlayers ?? 2,
        asyncMode: body.settings.asyncMode ?? false,
        turnTimerSeconds: body.settings.turnTimerSeconds ?? null,
        isPrivate: body.settings.isPrivate ?? false,
        password: body.settings.password ?? null,
      },
    };

    const room = await createRoom(req.user!.playerId, payload);
    await writeRoomMeta(room);

    res.status(201).json(room);
  } catch (err) {
    logger.error('POST /rooms failed', { err });
    next(err);
  }
});

// GET /api/v1/rooms/:id
roomsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const room = await getRoomById(req.params['id']!);

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    // Self-heal room:meta in Redis. Redis is ephemeral; a restart wipes
    // room:meta but the Room row survives in Postgres. Without this, when
    // the host later clicks Start Game, socket-service's startGame handler
    // can't resolve the gameId and silently falls back to the wrong engine.
    await writeRoomMeta(room);

    res.json(room);
  } catch (err) {
    logger.error('GET /rooms/:id failed', { err });
    next(err);
  }
});

// PATCH /api/v1/rooms/:id
roomsRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, settings } = req.body as { name?: string; settings?: Record<string, unknown> };

    let room;
    try {
      room = await updateRoom(
        req.params['id']!,
        req.user!.playerId,
        { name, settings },
      );
    } catch (serviceErr) {
      const e = serviceErr as Error & { message: string };
      if (e.message === 'FORBIDDEN') {
        res.status(403).json({ error: 'Only the host can update this room' });
        return;
      }
      throw serviceErr;
    }

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    res.json(room);
  } catch (err) {
    logger.error('PATCH /rooms/:id failed', { err });
    next(err);
  }
});

// DELETE /api/v1/rooms/:id
roomsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let deleted;
    try {
      deleted = await deleteRoom(req.params['id']!, req.user!.playerId);
    } catch (serviceErr) {
      const e = serviceErr as Error & { message: string };
      if (e.message === 'FORBIDDEN') {
        res.status(403).json({ error: 'Only the host can delete this room' });
        return;
      }
      throw serviceErr;
    }

    if (!deleted) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('DELETE /rooms/:id failed', { err });
    next(err);
  }
});
