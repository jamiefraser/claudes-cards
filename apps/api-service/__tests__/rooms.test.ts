/**
 * Rooms API Tests — Unit 5
 *
 * Tests for GET/POST/PATCH/DELETE /api/v1/rooms
 * Happy path + error cases per SPEC.md §25.
 */

import request from 'supertest';
import app from '../src/index';
import { prisma } from '../src/db/prisma';

const TEST_SECRET = 'test-secret';

let playerToken: string;
let player2Token: string;
let playerId: string;

beforeAll(async () => {
  process.env.AUTH_MODE = 'dev';
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';

  // Get tokens for test players
  const res1 = await request(app)
    .post('/api/v1/dev/token')
    .send({ username: 'test-player-1' });
  playerToken = res1.body.token;
  playerId = res1.body.playerId;

  const res2 = await request(app)
    .post('/api/v1/dev/token')
    .send({ username: 'test-player-2' });
  player2Token = res2.body.token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Reset non-seed test data before each test
  await request(app).post('/api/v1/test/reset');
});

describe('GET /api/v1/rooms', () => {
  it('returns a list of rooms for authenticated user', async () => {
    const res = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    expect(Array.isArray(res.body.rooms)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('filters rooms by gameId', async () => {
    // Create a room first
    await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({
        gameId: 'cribbage',
        name: 'Test Room',
        settings: { maxPlayers: 2, asyncMode: false, turnTimerSeconds: null, isPrivate: false, password: null },
      });

    const res = await request(app)
      .get('/api/v1/rooms?gameId=cribbage')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    expect(Array.isArray(res.body.rooms)).toBe(true);
    res.body.rooms.forEach((room: { gameId: string }) => {
      expect(room.gameId).toBe('cribbage');
    });
  });

  it('returns 401 when not authenticated', async () => {
    await request(app).get('/api/v1/rooms').expect(401);
  });
});

describe('POST /api/v1/rooms', () => {
  it('creates a room and returns it', async () => {
    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({
        gameId: 'cribbage',
        name: 'My Test Room',
        settings: { maxPlayers: 2, asyncMode: false, turnTimerSeconds: null, isPrivate: false, password: null },
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.gameId).toBe('cribbage');
    expect(res.body.name).toBe('My Test Room');
    expect(res.body.hostId).toBe(playerId);
    expect(res.body.status).toBe('waiting');
  });

  it('returns 400 when gameId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({
        name: 'Missing gameId',
        settings: { maxPlayers: 2, asyncMode: false, turnTimerSeconds: null, isPrivate: false, password: null },
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  it('returns 401 when not authenticated', async () => {
    await request(app)
      .post('/api/v1/rooms')
      .send({ gameId: 'cribbage', name: 'x', settings: {} })
      .expect(401);
  });
});

describe('GET /api/v1/rooms/:id', () => {
  it('returns a room by id', async () => {
    const createRes = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({
        gameId: 'cribbage',
        name: 'Get Room Test',
        settings: { maxPlayers: 2, asyncMode: false, turnTimerSeconds: null, isPrivate: false, password: null },
      });

    const roomId = createRes.body.id;

    const res = await request(app)
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    expect(res.body.id).toBe(roomId);
    expect(res.body.name).toBe('Get Room Test');
  });

  it('returns 404 for non-existent room', async () => {
    await request(app)
      .get('/api/v1/rooms/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(404);
  });

  it('returns 401 when not authenticated', async () => {
    await request(app)
      .get('/api/v1/rooms/some-id')
      .expect(401);
  });
});

describe('PATCH /api/v1/rooms/:id', () => {
  it('allows host to update room settings', async () => {
    const createRes = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({
        gameId: 'cribbage',
        name: 'Patch Room Test',
        settings: { maxPlayers: 2, asyncMode: false, turnTimerSeconds: null, isPrivate: false, password: null },
      });

    const roomId = createRes.body.id;

    const res = await request(app)
      .patch(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ name: 'Updated Room Name' })
      .expect(200);

    expect(res.body.name).toBe('Updated Room Name');
  });

  it('returns 403 when non-host tries to update', async () => {
    const createRes = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({
        gameId: 'cribbage',
        name: 'Host Only Room',
        settings: { maxPlayers: 2, asyncMode: false, turnTimerSeconds: null, isPrivate: false, password: null },
      });

    const roomId = createRes.body.id;

    await request(app)
      .patch(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${player2Token}`)
      .send({ name: 'Unauthorized Update' })
      .expect(403);
  });

  it('returns 404 for non-existent room', async () => {
    await request(app)
      .patch('/api/v1/rooms/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ name: 'Doesnt matter' })
      .expect(404);
  });
});

describe('DELETE /api/v1/rooms/:id', () => {
  it('allows host to delete a room', async () => {
    const createRes = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({
        gameId: 'cribbage',
        name: 'Delete Room Test',
        settings: { maxPlayers: 2, asyncMode: false, turnTimerSeconds: null, isPrivate: false, password: null },
      });

    const roomId = createRes.body.id;

    await request(app)
      .delete(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    // Verify room is gone
    await request(app)
      .get(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(404);
  });

  it('returns 403 when non-host tries to delete', async () => {
    const createRes = await request(app)
      .post('/api/v1/rooms')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({
        gameId: 'cribbage',
        name: 'Delete Only Host',
        settings: { maxPlayers: 2, asyncMode: false, turnTimerSeconds: null, isPrivate: false, password: null },
      });

    const roomId = createRes.body.id;

    await request(app)
      .delete(`/api/v1/rooms/${roomId}`)
      .set('Authorization', `Bearer ${player2Token}`)
      .expect(403);
  });

  it('returns 404 for non-existent room', async () => {
    await request(app)
      .delete('/api/v1/rooms/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(404);
  });
});
