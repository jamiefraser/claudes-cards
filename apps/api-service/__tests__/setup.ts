// Jest setup — ensure environment variables are set before any module loads
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/card_platform?schema=public';
}

// Set test environment defaults — these must be set before index.ts loads
// so that AUTH_MODE-gated and TEST_MODE-gated routes are properly mounted.
if (!process.env.AUTH_MODE) {
  process.env.AUTH_MODE = 'dev';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret';
}
if (!process.env.TEST_MODE) {
  process.env.TEST_MODE = 'true';
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}
