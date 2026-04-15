/**
 * Socket Service — Entry Point
 *
 * Wires together:
 * - Express + HTTP server
 * - Socket.io with /game and /lobby namespaces
 * - Redis pub/sub subscriber
 * - Health endpoint GET /health
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { logger } from './utils/logger';
import { GameRegistry } from './games/registry';
import { BotController } from './bots/BotController';
import { BotPlayer } from './bots/BotPlayer';
import { BotSweeper } from './bots/BotSweeper';
import { GenericBotStrategy } from './bots/strategies/generic.strategy';

// Game engines
import { Phase10Engine } from './games/phase10/engine';
import { RummyEngine } from './games/rummy/engine';
import { GinRummyEngine } from './games/ginrummy/engine';
import { CanastaEngine } from './games/canasta/engine';
import { CribbageEngine } from './games/cribbage/engine';
import { SpadesEngine } from './games/spades/engine';
import { HeartsEngine } from './games/hearts/engine';
import { EuchreEngine } from './games/euchre/engine';
import { WhistEngine } from './games/whist/engine';
import { OhHellEngine } from './games/ohhell/engine';
import { GoFishEngine } from './games/gofish/engine';
import { CrazyEightsEngine } from './games/crazyeights/engine';
import { WarEngine } from './games/war/engine';
import { SpitEngine } from './games/spit/engine';
import { IdiotEngine } from './games/idiot/engine';

// Bot strategies
import { Phase10BotStrategy } from './bots/strategies/phase10.strategy';
import { RummyBotStrategy } from './bots/strategies/rummy.strategy';
import { GinRummyBotStrategy } from './bots/strategies/ginrummy.strategy';
import { CribbageBotStrategy } from './bots/strategies/cribbage.strategy';
import { GoFishBotStrategy } from './bots/strategies/gofish.strategy';
import { CrazyEightsBotStrategy } from './bots/strategies/crazyeights.strategy';

import { setupGameNamespace } from './namespaces/game.namespace';
import { setupLobbyNamespace } from './namespaces/lobby.namespace';
import { setupPubSubSubscriber } from './pubsub/subscriber';

// ---------------------------------------------------------------------------
// Express + HTTP
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const httpServer = createServer(app);

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST'],
  },
});

// ---------------------------------------------------------------------------
// Game Registry — register all engines and bot strategies
// ---------------------------------------------------------------------------

const registry = new GameRegistry();

// Unit 7 — Phase 10
registry.register(new Phase10Engine(), new Phase10BotStrategy());

// Unit 15 — Priority 1
registry.register(new RummyEngine(), new RummyBotStrategy());
registry.register(new GinRummyEngine(), new GinRummyBotStrategy());
registry.register(new CanastaEngine(), new GenericBotStrategy('canasta')); // no async, no bot needed

// Unit 16 — Cribbage
registry.register(new CribbageEngine(), new CribbageBotStrategy());

// Unit 17 — Priority 3 (real-time, GenericBotStrategy as fallback)
registry.register(new SpadesEngine(), new GenericBotStrategy('spades'));
registry.register(new HeartsEngine(), new GenericBotStrategy('hearts'));
registry.register(new EuchreEngine(), new GenericBotStrategy('euchre'));
registry.register(new WhistEngine(), new GenericBotStrategy('whist'));
registry.register(new OhHellEngine(), new GenericBotStrategy('ohhell'));

// Unit 18 — Priority 4
registry.register(new GoFishEngine(), new GoFishBotStrategy());
registry.register(new CrazyEightsEngine(), new CrazyEightsBotStrategy());
registry.register(new WarEngine(), new GenericBotStrategy('war'));
registry.register(new SpitEngine(), new GenericBotStrategy('spit'));
registry.register(new IdiotEngine(), new GenericBotStrategy('idiot'));

// ---------------------------------------------------------------------------
// Bot system
// ---------------------------------------------------------------------------

const botController = new BotController();
const botPlayer = new BotPlayer(registry, botController);

// Expose botPlayer globally for scheduled actions in BotController
(globalThis as Record<string, unknown>)['_botPlayer'] = botPlayer;

// BotSweeper — at-least-once backstop for pub/sub misses (see BotSweeper.ts).
// Skipped in the test harness since the interval would keep Jest alive.
const botSweeper = new BotSweeper(botPlayer, botController);
if (process.env.NODE_ENV !== 'test') {
  botSweeper.start();
}

// ---------------------------------------------------------------------------
// Namespaces
// ---------------------------------------------------------------------------

setupGameNamespace(io, registry, botController, botPlayer);
setupLobbyNamespace(io);

// ---------------------------------------------------------------------------
// Pub/Sub
// ---------------------------------------------------------------------------

setupPubSubSubscriber(io, botController, botPlayer);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const port = parseInt(process.env.SOCKET_PORT ?? '3002', 10);

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(port, () => {
    logger.info('Socket service started', { port });
  });
}

// ---------------------------------------------------------------------------
// Exports (used by tests)
// ---------------------------------------------------------------------------

export { httpServer, io, botSweeper };

/**
 * Returns the Socket.io Server instance.
 * Used by BotController and BotPlayer to emit events.
 * Throws if called before the server is initialised.
 */
export function getIO(): Server {
  return io;
}
