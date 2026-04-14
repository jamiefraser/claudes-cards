/**
 * Friends API Tests — Unit 5
 *
 * Tests for GET /friends, POST /friends/request, PATCH /friends/:id/accept,
 * PATCH /friends/:id/block, DELETE /friends/:id
 */

import request from 'supertest';
import app from '../src/index';
import { prisma } from '../src/db/prisma';

const TEST_SECRET = 'test-secret';

let player1Token: string;
let player2Token: string;
let player3Token: string;
let player1Id: string;
let player2Id: string;

beforeAll(async () => {
  process.env.AUTH_MODE = 'dev';
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';

  const res1 = await request(app)
    .post('/api/v1/dev/token')
    .send({ username: 'test-player-1' });
  player1Token = res1.body.token;
  player1Id = res1.body.playerId;

  const res2 = await request(app)
    .post('/api/v1/dev/token')
    .send({ username: 'test-player-2' });
  player2Token = res2.body.token;
  player2Id = res2.body.playerId;

  const res3 = await request(app)
    .post('/api/v1/dev/token')
    .send({ username: 'test-player-3' });
  player3Token = res3.body.token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await request(app).post('/api/v1/test/reset');
});

describe('GET /api/v1/friends', () => {
  it('returns an empty list when no friends exist', async () => {
    const res = await request(app)
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${player1Token}`)
      .expect(200);

    expect(Array.isArray(res.body.friends)).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    await request(app).get('/api/v1/friends').expect(401);
  });
});

describe('POST /api/v1/friends/request', () => {
  it('sends a friend request', async () => {
    const res = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ toPlayerId: player2Id })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.requesterId).toBe(player1Id);
    expect(res.body.addresseeId).toBe(player2Id);
    expect(res.body.status).toBe('pending');
  });

  it('returns 400 when toPlayerId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${player1Token}`)
      .send({})
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when sending request to yourself', async () => {
    const res = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ toPlayerId: player1Id })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  it('returns 409 when request already exists', async () => {
    await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ toPlayerId: player2Id });

    const res = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ toPlayerId: player2Id })
      .expect(409);

    expect(res.body.error).toBeDefined();
  });

  it('returns 401 when not authenticated', async () => {
    await request(app)
      .post('/api/v1/friends/request')
      .send({ toPlayerId: player2Id })
      .expect(401);
  });
});

describe('PATCH /api/v1/friends/:id/accept', () => {
  it('accepts a friend request', async () => {
    // Player 1 sends request to player 2
    const reqRes = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ toPlayerId: player2Id });

    const friendRelationId = reqRes.body.id;

    // Player 2 accepts
    const res = await request(app)
      .patch(`/api/v1/friends/${friendRelationId}/accept`)
      .set('Authorization', `Bearer ${player2Token}`)
      .expect(200);

    expect(res.body.status).toBe('accepted');
  });

  it('returns 403 when requester tries to accept their own request', async () => {
    const reqRes = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ toPlayerId: player2Id });

    const friendRelationId = reqRes.body.id;

    // Player 1 (requester) tries to accept
    await request(app)
      .patch(`/api/v1/friends/${friendRelationId}/accept`)
      .set('Authorization', `Bearer ${player1Token}`)
      .expect(403);
  });

  it('returns 404 for non-existent friend relation', async () => {
    await request(app)
      .patch('/api/v1/friends/00000000-0000-0000-0000-000000000000/accept')
      .set('Authorization', `Bearer ${player2Token}`)
      .expect(404);
  });
});

describe('PATCH /api/v1/friends/:id/block', () => {
  it('blocks a friend relation', async () => {
    const reqRes = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ toPlayerId: player2Id });

    const friendRelationId = reqRes.body.id;

    // Player 2 blocks player 1
    const res = await request(app)
      .patch(`/api/v1/friends/${friendRelationId}/block`)
      .set('Authorization', `Bearer ${player2Token}`)
      .expect(200);

    expect(res.body.status).toBe('blocked');
  });

  it('returns 403 when uninvolved player tries to block', async () => {
    const reqRes = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ toPlayerId: player2Id });

    const friendRelationId = reqRes.body.id;

    // Player 3 tries to block
    await request(app)
      .patch(`/api/v1/friends/${friendRelationId}/block`)
      .set('Authorization', `Bearer ${player3Token}`)
      .expect(403);
  });

  it('returns 404 for non-existent friend relation', async () => {
    await request(app)
      .patch('/api/v1/friends/00000000-0000-0000-0000-000000000000/block')
      .set('Authorization', `Bearer ${player1Token}`)
      .expect(404);
  });
});

describe('DELETE /api/v1/friends/:id', () => {
  it('removes a friend relation', async () => {
    const reqRes = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ toPlayerId: player2Id });

    const friendRelationId = reqRes.body.id;

    // Accept first
    await request(app)
      .patch(`/api/v1/friends/${friendRelationId}/accept`)
      .set('Authorization', `Bearer ${player2Token}`);

    // Then remove
    await request(app)
      .delete(`/api/v1/friends/${friendRelationId}`)
      .set('Authorization', `Bearer ${player1Token}`)
      .expect(200);
  });

  it('returns 403 when uninvolved player tries to delete', async () => {
    const reqRes = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${player1Token}`)
      .send({ toPlayerId: player2Id });

    const friendRelationId = reqRes.body.id;

    // Player 3 tries to delete
    await request(app)
      .delete(`/api/v1/friends/${friendRelationId}`)
      .set('Authorization', `Bearer ${player3Token}`)
      .expect(403);
  });

  it('returns 404 for non-existent friend relation', async () => {
    await request(app)
      .delete('/api/v1/friends/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${player1Token}`)
      .expect(404);
  });
});
