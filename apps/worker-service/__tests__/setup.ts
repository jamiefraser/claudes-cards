// Jest setup for worker-service tests
// Sets required environment variables before any module loads

if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'redis://localhost:6379';
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/card_platform?schema=public';
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret';
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
