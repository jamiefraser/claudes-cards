/**
 * Test Routes Tests — Unit 3
 *
 * Tests for the TEST_MODE=true endpoints.
 */

// We need a separate app instance with TEST_MODE=true.
// Set env vars before requiring app so the conditional mount fires.
process.env.TEST_MODE = 'true';
process.env.AUTH_MODE = 'dev';
process.env.JWT_SECRET = 'test-jwt-secret';

// Re-require a fresh app instance
// Jest module cache is isolated per test file so this is safe.
import request from 'supertest';
import app from '../src/index';

afterAll(async () => {
  process.env.TEST_MODE = 'false';
  const { prisma } = await import('../src/db/prisma');
  await prisma.$disconnect();
});

describe('POST /api/v1/test/force-bot-activate', () => {
  it('returns 200 with ok and echoes roomId/playerId', async () => {
    const res = await request(app)
      .post('/api/v1/test/force-bot-activate')
      .send({ roomId: 'room-1', playerId: 'player-1' })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.roomId).toBe('room-1');
    expect(res.body.playerId).toBe('player-1');
  });

  it('returns 400 when roomId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/test/force-bot-activate')
      .send({ playerId: 'player-1' })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });
});

describe('POST /api/v1/test/force-player-rejoin', () => {
  it('returns 200 with ok and echoes roomId/playerId', async () => {
    const res = await request(app)
      .post('/api/v1/test/force-player-rejoin')
      .send({ roomId: 'room-1', playerId: 'player-1' })
      .expect(200);

    expect(res.body.ok).toBe(true);
  });

  it('returns 400 when playerId is missing', async () => {
    await request(app)
      .post('/api/v1/test/force-player-rejoin')
      .send({ roomId: 'room-1' })
      .expect(400);
  });
});

describe('POST /api/v1/test/reset', () => {
  it('returns 200 and a success message', async () => {
    const res = await request(app)
      .post('/api/v1/test/reset')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.message).toBeDefined();
  });
});
