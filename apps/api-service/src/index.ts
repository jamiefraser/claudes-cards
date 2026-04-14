/**
 * API Service — Entry Point
 *
 * Wires together Express middleware, route groups, and the global error handler.
 * Route and middleware activation respects AUTH_MODE and TEST_MODE guards.
 */

import express from 'express';
import cors from 'cors';

import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health.routes';
import { authRouter } from './routes/auth.routes';
import { playersRouter } from './routes/players.routes';
import { roomsRouter } from './routes/rooms.routes';
import { gamesRouter } from './routes/games.routes';
import { friendsRouter } from './routes/friends.routes';
import { leaderboardRouter } from './routes/leaderboard.routes';
import { messagesRouter } from './routes/messages.routes';
import { adminRouter } from './routes/admin.routes';

const app = express();
const port = process.env.API_PORT || 3001;

// ---------------------------------------------------------------------------
// Core middleware
// ---------------------------------------------------------------------------

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Health routes (no auth required — used by k8s probes)
// ---------------------------------------------------------------------------

app.use('/health', healthRouter);

// ---------------------------------------------------------------------------
// Dev-only routes (AUTH_MODE=dev)
// ---------------------------------------------------------------------------

if (process.env.AUTH_MODE === 'dev' || process.env.AUTH_MODE === undefined) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { devRouter } = require('./routes/dev.routes') as typeof import('./routes/dev.routes');
  app.use('/api/v1/dev', devRouter);
  logger.info('Dev routes mounted at /api/v1/dev (AUTH_MODE=dev)');
}

// ---------------------------------------------------------------------------
// Test-only routes (TEST_MODE=true)
// ---------------------------------------------------------------------------

if (process.env.TEST_MODE === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { testRouter } = require('./routes/test.routes') as typeof import('./routes/test.routes');
  app.use('/api/v1/test', testRouter);
  logger.info('Test routes mounted at /api/v1/test (TEST_MODE=true)');
}

// ---------------------------------------------------------------------------
// Protected API routes
// ---------------------------------------------------------------------------

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/players', playersRouter);
app.use('/api/v1/rooms', roomsRouter);
app.use('/api/v1/games', gamesRouter);
app.use('/api/v1/friends', friendsRouter);
app.use('/api/v1/leaderboard', leaderboardRouter);
app.use('/api/v1/messages', messagesRouter);
app.use('/api/v1/admin', adminRouter);

// ---------------------------------------------------------------------------
// Global error handler (must be last)
// ---------------------------------------------------------------------------

app.use(errorHandler);

// ---------------------------------------------------------------------------
// Server startup (skipped when imported by tests)
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  app.listen(port, () => {
    logger.info(`API service listening on port ${port}`, { port, authMode: process.env.AUTH_MODE });
  });
}

export default app;
