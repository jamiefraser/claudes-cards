/**
 * Health Routes Tests — Unit 3
 */

import request from 'supertest';
import app from '../src/index';

beforeAll(() => {
  process.env.AUTH_MODE = 'dev';
  process.env.JWT_SECRET = 'test-jwt-secret';
});

afterAll(async () => {
  const { prisma } = await import('../src/db/prisma');
  await prisma.$disconnect();
});

describe('GET /health', () => {
  it('returns 200 with status ok and timestamp', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });
});

describe('GET /health/ready', () => {
  it('returns 200 when DB is reachable', async () => {
    const res = await request(app).get('/health/ready').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.db).toBe('ok');
  });
});
