/**
 * Dev Routes Tests — Unit 3
 *
 * Tests for POST /api/v1/dev/token.
 * Only active when AUTH_MODE=dev.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/index';
import { DevTokenPayload } from '@shared/auth';

const TEST_SECRET = 'test-jwt-secret';

beforeAll(() => {
  process.env.AUTH_MODE = 'dev';
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.TEST_MODE = 'false';
});

afterAll(async () => {
  // Close prisma connection to avoid open handle warnings
  const { prisma } = await import('../src/db/prisma');
  await prisma.$disconnect();
});

describe('POST /api/v1/dev/token', () => {
  it('returns a signed JWT for a known test user', async () => {
    const res = await request(app)
      .post('/api/v1/dev/token')
      .send({ username: 'test-player-1' })
      .expect(200);

    expect(res.body.token).toBeDefined();
    const decoded = jwt.verify(res.body.token, TEST_SECRET) as DevTokenPayload;
    expect(decoded.sub).toBeDefined();
    expect(decoded.username).toBe('test-player-1');
    expect(decoded.role).toBe('player');
    expect(decoded.displayName).toBe('TestPlayer1');
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('returns a JWT with moderator role for test-moderator', async () => {
    const res = await request(app)
      .post('/api/v1/dev/token')
      .send({ username: 'test-moderator' })
      .expect(200);

    const decoded = jwt.verify(res.body.token, TEST_SECRET) as DevTokenPayload;
    expect(decoded.role).toBe('moderator');
    expect(decoded.username).toBe('test-moderator');
  });

  it('returns a JWT with admin role for test-admin', async () => {
    const res = await request(app)
      .post('/api/v1/dev/token')
      .send({ username: 'test-admin' })
      .expect(200);

    const decoded = jwt.verify(res.body.token, TEST_SECRET) as DevTokenPayload;
    expect(decoded.role).toBe('admin');
  });

  it('returns 404 for a username that does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/dev/token')
      .send({ username: 'nonexistent-user' })
      .expect(404);

    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when username is missing from request body', async () => {
    const res = await request(app)
      .post('/api/v1/dev/token')
      .send({})
      .expect(400);

    expect(res.body.error).toBeDefined();
  });
});

describe('GET /health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});
