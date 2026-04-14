/**
 * Jest setup — configure environment variables before any module loads.
 */

if (!process.env.AUTH_MODE) {
  process.env.AUTH_MODE = 'dev';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret';
}
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'redis://localhost:6379';
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
if (!process.env.TEST_MODE) {
  process.env.TEST_MODE = 'true';
}
