/**
 * Admin API Tests — Unit 5
 *
 * Tests for admin endpoints per SPEC.md §25.1.
 * Tests role enforcement: moderator+ for most, admin-only for game/leaderboard ops.
 */

import request from 'supertest';
import app from '../src/index';
import { prisma } from '../src/db/prisma';

const TEST_SECRET = 'test-secret';

let playerToken: string;
let moderatorToken: string;
let adminToken: string;
let player1Id: string;

beforeAll(async () => {
  process.env.AUTH_MODE = 'dev';
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';

  const res1 = await request(app)
    .post('/api/v1/dev/token')
    .send({ username: 'test-player-1' });
  playerToken = res1.body.token;
  player1Id = res1.body.playerId;

  const res2 = await request(app)
    .post('/api/v1/dev/token')
    .send({ username: 'test-moderator' });
  moderatorToken = res2.body.token;

  const res3 = await request(app)
    .post('/api/v1/dev/token')
    .send({ username: 'test-admin' });
  adminToken = res3.body.token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await request(app).post('/api/v1/test/reset');
});

describe('GET /api/v1/admin/dashboard', () => {
  it('returns dashboard stats for moderator', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('activePlayers');
    expect(res.body).toHaveProperty('activeRooms');
    expect(res.body).toHaveProperty('pendingReports');
    expect(res.body).toHaveProperty('activelyMuted');
    expect(res.body).toHaveProperty('gamesPlayedToday');
  });

  it('returns dashboard stats for admin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('activePlayers');
  });

  it('returns 403 for regular player', async () => {
    await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(403);
  });

  it('returns 401 when not authenticated', async () => {
    await request(app)
      .get('/api/v1/admin/dashboard')
      .expect(401);
  });
});

describe('GET /api/v1/admin/reports', () => {
  it('returns paginated reports for moderator', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(Array.isArray(res.body.reports)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('pageSize');
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports?status=PENDING')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(Array.isArray(res.body.reports)).toBe(true);
  });

  it('returns 403 for regular player', async () => {
    await request(app)
      .get('/api/v1/admin/reports')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(403);
  });
});

describe('PATCH /api/v1/admin/reports/:id', () => {
  it('returns 404 for non-existent report', async () => {
    await request(app)
      .patch('/api/v1/admin/reports/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action: 'dismiss' })
      .expect(404);
  });

  it('returns 403 for regular player', async () => {
    await request(app)
      .patch('/api/v1/admin/reports/some-id')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ action: 'dismiss' })
      .expect(403);
  });

  it('returns 400 when action is invalid', async () => {
    await request(app)
      .patch('/api/v1/admin/reports/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ action: 'invalid-action' })
      .expect(400);
  });
});

describe('POST /api/v1/admin/mute', () => {
  it('mutes a player (moderator)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/mute')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ playerId: player1Id, duration: '1hr', reason: 'Test mute' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.playerId).toBe(player1Id);
    expect(res.body.reason).toBe('Test mute');
  });

  it('returns 400 when playerId is missing', async () => {
    await request(app)
      .post('/api/v1/admin/mute')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ duration: '1hr', reason: 'Missing playerId' })
      .expect(400);
  });

  it('returns 403 for regular player', async () => {
    await request(app)
      .post('/api/v1/admin/mute')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ playerId: player1Id, duration: '1hr', reason: 'Unauthorized' })
      .expect(403);
  });
});

describe('DELETE /api/v1/admin/mute/:playerId', () => {
  it('unmutes a player (moderator)', async () => {
    // First mute the player
    await request(app)
      .post('/api/v1/admin/mute')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ playerId: player1Id, duration: '1hr', reason: 'Test' });

    const res = await request(app)
      .delete(`/api/v1/admin/mute/${player1Id}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('returns 403 for regular player', async () => {
    await request(app)
      .delete(`/api/v1/admin/mute/${player1Id}`)
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(403);
  });
});

describe('GET /api/v1/admin/users/:id', () => {
  it('returns admin player profile for moderator', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/users/${player1Id}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(res.body.id).toBe(player1Id);
    expect(res.body).toHaveProperty('username');
    expect(res.body).toHaveProperty('gamesPlayed');
    expect(res.body).toHaveProperty('activeMutes');
    expect(res.body).toHaveProperty('reportHistory');
  });

  it('returns 404 for non-existent player', async () => {
    await request(app)
      .get('/api/v1/admin/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(404);
  });

  it('returns 403 for regular player', async () => {
    await request(app)
      .get(`/api/v1/admin/users/${player1Id}`)
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(403);
  });
});

describe('GET /api/v1/admin/audit', () => {
  it('returns audit log entries for moderator', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('filters by playerId', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/audit?playerId=${player1Id}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(200);

    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  it('returns 403 for regular player', async () => {
    await request(app)
      .get('/api/v1/admin/audit')
      .set('Authorization', `Bearer ${playerToken}`)
      .expect(403);
  });
});

describe('PATCH /api/v1/admin/games/:id', () => {
  it('enables/disables a game for admin', async () => {
    // Get a game first
    const gamesRes = await request(app)
      .get('/api/v1/games')
      .set('Authorization', `Bearer ${adminToken}`);

    if (Array.isArray(gamesRes.body) && gamesRes.body.length > 0) {
      const gameId = gamesRes.body[0].id;

      const res = await request(app)
        .patch(`/api/v1/admin/games/${gameId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false })
        .expect(200);

      expect(res.body.id).toBe(gameId);
      expect(res.body.enabled).toBe(false);

      // Re-enable it
      await request(app)
        .patch(`/api/v1/admin/games/${gameId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true });
    }
  });

  it('returns 403 for moderator (admin only)', async () => {
    await request(app)
      .patch('/api/v1/admin/games/some-id')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ enabled: false })
      .expect(403);
  });

  it('returns 403 for regular player', async () => {
    await request(app)
      .patch('/api/v1/admin/games/some-id')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ enabled: false })
      .expect(403);
  });
});

describe('POST /api/v1/admin/leaderboards/:gameId/recalculate', () => {
  it('triggers recalc for admin', async () => {
    const res = await request(app)
      .post('/api/v1/admin/leaderboards/cribbage/recalculate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('returns 403 for moderator (admin only)', async () => {
    await request(app)
      .post('/api/v1/admin/leaderboards/cribbage/recalculate')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(403);
  });
});

describe('DELETE /api/v1/admin/leaderboards/:gameId/monthly', () => {
  it('resets monthly leaderboard for admin', async () => {
    const res = await request(app)
      .delete('/api/v1/admin/leaderboards/cribbage/monthly')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('returns 403 for moderator (admin only)', async () => {
    await request(app)
      .delete('/api/v1/admin/leaderboards/cribbage/monthly')
      .set('Authorization', `Bearer ${moderatorToken}`)
      .expect(403);
  });
});
