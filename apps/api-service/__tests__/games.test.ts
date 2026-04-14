/**
 * Games API Tests — Unit 5
 *
 * Tests for GET /api/v1/games, GET /api/v1/games/:id,
 * GET /api/v1/games/replay/:roomId
 */

import request from 'supertest';
import app from '../src/index';
import { prisma } from '../src/db/prisma';

const TEST_SECRET = 'test-secret';

let playerToken: string;
let adminToken: string;

beforeAll(async () => {
  process.env.AUTH_MODE = 'dev';
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';

  const res1 = await request(app)
    .post('/api/v1/dev/token')
    .send({ username: 'test-player-1' });
  playerToken = res1.body.token;

  const res2 = await request(app)
    .post('/api/v1/dev/token')
    .send({ username: 'test-admin' });
  adminToken = res2.body.token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/v1/games', () => {
  it('returns the game catalog list', async () => {
    const res = await request(app)
      .get('/api/v1/games')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    expect(Array.isArray(res.body.games)).toBe(true);
    if (res.body.games.length > 0) {
      const game = res.body.games[0];
      expect(game.id).toBeDefined();
      expect(game.name).toBeDefined();
      expect(game.enabled).toBeDefined();
    }
  });

  it('returns 401 when not authenticated', async () => {
    await request(app).get('/api/v1/games').expect(401);
  });
});

describe('GET /api/v1/games/:id', () => {
  it('returns a game catalog entry by id', async () => {
    // First get the list to find a valid id
    const listRes = await request(app)
      .get('/api/v1/games')
      .set('Authorization', `Bearer ${playerToken}`);

    if (listRes.body.games.length > 0) {
      const gameId = listRes.body.games[0].id;

      const res = await request(app)
        .get(`/api/v1/games/${gameId}`)
        .set('Authorization', `Bearer ${playerToken}`)
        .expect(200);

      expect(res.body.id).toBe(gameId);
    }
  });

  it('returns 404 for non-existent game', async () => {
    await request(app)
      .get('/api/v1/games/nonexistent-game-id')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(404);
  });

  it('returns 401 when not authenticated', async () => {
    await request(app)
      .get('/api/v1/games/some-id')
      .expect(401);
  });
});

describe('GET /api/v1/games/replay/:roomId', () => {
  it('returns game actions for admin', async () => {
    // Use a non-existent roomId — should return empty array, not 404
    const res = await request(app)
      .get('/api/v1/games/replay/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.actions)).toBe(true);
  });

  it('returns game actions in AUTH_MODE=dev for regular player', async () => {
    // In dev mode, any authenticated user can access replay
    const res = await request(app)
      .get('/api/v1/games/replay/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    expect(Array.isArray(res.body.actions)).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    await request(app)
      .get('/api/v1/games/replay/some-room-id')
      .expect(401);
  });
});
