/**
 * Leaderboard API Tests — Unit 5
 *
 * Tests for GET /api/v1/leaderboard/:gameId and
 * GET /api/v1/leaderboard/:gameId/friends
 */

import request from 'supertest';
import app from '../src/index';
import { prisma } from '../src/db/prisma';

const TEST_SECRET = 'test-secret';

let playerToken: string;

beforeAll(async () => {
  process.env.AUTH_MODE = 'dev';
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';

  const res = await request(app)
    .post('/api/v1/dev/token')
    .send({ username: 'test-player-1' });
  playerToken = res.body.token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/v1/leaderboard/:gameId', () => {
  it('returns leaderboard entries for a game (all-time)', async () => {
    const res = await request(app)
      .get('/api/v1/leaderboard/cribbage?period=all-time')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('returns monthly leaderboard with month filter', async () => {
    const res = await request(app)
      .get('/api/v1/leaderboard/cribbage?period=monthly&month=2026-04')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    expect(Array.isArray(res.body.entries)).toBe(true);
    res.body.entries.forEach((entry: { period: string }) => {
      expect(entry.period).toBe('monthly');
    });
  });

  it('respects limit and offset query params', async () => {
    const res = await request(app)
      .get('/api/v1/leaderboard/cribbage?period=all-time&limit=5&offset=0')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBeLessThanOrEqual(5);
  });

  it('returns 401 when not authenticated', async () => {
    await request(app)
      .get('/api/v1/leaderboard/cribbage')
      .expect(401);
  });

  it('defaults to all-time when period is not provided', async () => {
    const res = await request(app)
      .get('/api/v1/leaderboard/cribbage')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    expect(Array.isArray(res.body.entries)).toBe(true);
  });
});

describe('GET /api/v1/leaderboard/:gameId/friends', () => {
  it('returns friends-only leaderboard', async () => {
    const res = await request(app)
      .get('/api/v1/leaderboard/cribbage/friends')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(200);

    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    await request(app)
      .get('/api/v1/leaderboard/cribbage/friends')
      .expect(401);
  });
});
