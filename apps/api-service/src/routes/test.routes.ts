/**
 * Test Routes — TEST_MODE=true only
 *
 * These routes must never be reachable in production builds.
 * They are registered in index.ts only when TEST_MODE=true.
 *
 * POST /api/v1/test/force-bot-activate   { roomId, playerId }
 * POST /api/v1/test/force-player-rejoin  { roomId, playerId }
 * POST /api/v1/test/reset                Truncates non-seed data
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';

/**
 * Build a deterministic minimal Phase 10 GameState for testing.
 * Each player gets 10 cards. First 3 cards of player-1's hand form a valid "3 of a kind"
 * set for Phase 1, enabling lay-down tests.
 */
function buildPhase10TestState(
  roomId: string,
  players: { id: string; username: string }[],
): object {
  // Build cards matching the shared-types Card interface:
  //   { id, deckType, phase10Color, phase10Type, value, faceUp }
  const makeCard = (id: string, color: string, value: number) => ({
    id,
    deckType: 'phase10' as const,
    phase10Color: color,
    phase10Type: 'number' as const,
    value,
    faceUp: true,
  });

  // Player 1 hand: two complete sets of 3 (3x red-5, 3x blue-8) so Phase 1
  // can be laid down in the very first turn. Remaining 4 cards are
  // mismatched filler so no accidental hit-meld opportunities sit in the
  // hand pre-lay-down. This makes the lay-down → hit-meld → discard →
  // go-out chain deterministically reachable from a seeded game and is
  // the regression fixture for the stuck-bot-after-lay-down bug.
  const player1Hand = [
    makeCard('p1-card-0', 'red', 5),
    makeCard('p1-card-1', 'red', 5),
    makeCard('p1-card-2', 'red', 5),
    makeCard('p1-card-3', 'blue', 8),
    makeCard('p1-card-4', 'blue', 8),
    makeCard('p1-card-5', 'blue', 8),
    makeCard('p1-card-6', 'green', 2),
    makeCard('p1-card-7', 'yellow', 4),
    makeCard('p1-card-8', 'yellow', 11),
    makeCard('p1-card-9', 'blue', 12),
  ];
  // Deal every OTHER seat a deterministic 10-card hand. Each seat gets
  // cards keyed by its index so 3p/4p seeds produce distinct hands
  // without colliding on card ids.
  const buildGenericHand = (seatIdx: number) =>
    Array.from({ length: 10 }, (_, i) =>
      makeCard(
        `p${seatIdx + 1}-card-${i}`,
        (['red', 'blue', 'green', 'yellow'] as const)[(i + seatIdx) % 4]!,
        ((i + seatIdx * 3) % 12) + 1,
      ),
    );

  const playerStates = players.map((p, i) => ({
    playerId: p.id,
    displayName: p.username,
    hand: i === 0 ? player1Hand : buildGenericHand(i),
    score: 0,
    isOut: false,
    isBot: false,
    currentPhase: 1,
    phaseLaidDown: false,
  }));

  // Field names MUST match what Phase10Engine.handleDraw/handleDiscard
  // read from `pd`. Earlier versions of this seed used `drawPileCount`
  // and `topDiscard` (neither of which the engine recognises), leaving
  // `turnPhase` undefined and making every bot action bounce off the
  // phase guard. See SPEC.md §9.5 for the canonical Phase10PublicData
  // shape.
  const discardTop = makeCard('discard-top', 'red', 10);
  // Populate the draw pile with deterministic filler so bots can actually
  // draw without forcing a reshuffle. 30 cards is plenty for a
  // multi-turn smoke test.
  const drawPile = Array.from({ length: 30 }, (_, i) =>
    makeCard(
      `dp-card-${i}`,
      (['red', 'blue', 'green', 'yellow'] as const)[i % 4]!,
      ((i * 7) % 12) + 1,
    ),
  );
  return {
    version: 1,
    roomId,
    gameId: 'phase10',
    phase: 'playing',
    players: playerStates,
    currentTurn: players[0]?.id ?? null,
    turnNumber: 1,
    roundNumber: 1,
    publicData: {
      drawPile,
      discardPile: [discardTop],
      drawPileSize: drawPile.length,
      discardTop,
      turnPhase: 'draw',
      skippedPlayers: [],
      laidDownPhases: {},
    },
    updatedAt: new Date().toISOString(),
  };
}

function buildCribbageTestState(roomId: string, players: Array<{ id: string; username: string }>) {
  const makeSC = (id: string, rank: string, suit: 'hearts' | 'diamonds' | 'clubs' | 'spades') => {
    const valueMap: Record<string, number> = {
      A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '10': 10, J: 11, Q: 12, K: 13,
    };
    return {
      id,
      deckType: 'standard' as const,
      rank,
      suit,
      value: valueMap[rank]!,
      faceUp: false,
    };
  };

  // Two-player cribbage deal: 6 cards each.
  const p1Hand = [
    makeSC('p1-1', '5', 'hearts'),
    makeSC('p1-2', '5', 'spades'),
    makeSC('p1-3', '5', 'clubs'),
    makeSC('p1-4', 'J', 'diamonds'),
    makeSC('p1-5', '2', 'hearts'),
    makeSC('p1-6', '9', 'diamonds'),
  ];
  const p2Hand = [
    makeSC('p2-1', '7', 'hearts'),
    makeSC('p2-2', '7', 'diamonds'),
    makeSC('p2-3', 'K', 'clubs'),
    makeSC('p2-4', '3', 'spades'),
    makeSC('p2-5', '4', 'clubs'),
    makeSC('p2-6', '6', 'hearts'),
  ];

  const playerStates = players.map((p, i) => ({
    playerId: p.id,
    displayName: p.username,
    hand: i === 0 ? p1Hand : i === 1 ? p2Hand : [],
    score: 0,
    isOut: false,
    isBot: false,
    isDealer: i === 0,
  }));

  const board = {
    pegs: players.map((p, idx) => ({
      playerId: p.id,
      color: (['red', 'green', 'blue'] as const)[idx % 3]!,
      frontPeg: 0,
      backPeg: 0,
    })),
    skunkLine: 91,
    doubleskunkLine: 61,
    winScore: 121,
  };

  return {
    version: 1,
    roomId,
    gameId: 'cribbage',
    phase: 'playing',
    players: playerStates,
    currentTurn: players[0]?.id ?? null,
    turnNumber: 1,
    roundNumber: 1,
    publicData: {
      gamePhase: 'discarding',
      crib: [],
      cutCard: null,
      pegCount: 0,
      pegCards: [],
      pegCardPlayers: [],
      pegPlayOrder: players.map((p) => p.id),
      pegPassedPlayers: [],
      dealerIndex: 0,
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      discardedCount: Object.fromEntries(players.map((p) => [p.id, 0])),
    },
    cribbageBoardState: board,
    updatedAt: new Date().toISOString(),
  };
}

function buildCribbagePeggingState(roomId: string, players: Array<{ id: string; username: string }>) {
  const makeSC = (id: string, rank: string, suit: 'hearts' | 'diamonds' | 'clubs' | 'spades') => {
    const valueMap: Record<string, number> = {
      A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      '10': 10, J: 11, Q: 12, K: 13,
    };
    return {
      id,
      deckType: 'standard' as const,
      rank,
      suit,
      value: valueMap[rank]!,
      faceUp: false,
    };
  };

  // Each player has 4 cards remaining after the crib was formed. Cut card
  // is already shown; non-dealer (p2) leads the pegging.
  const p1Hand = [
    makeSC('p1-a', '5', 'hearts'),
    makeSC('p1-b', '10', 'spades'),
    makeSC('p1-c', 'J', 'diamonds'),
    makeSC('p1-d', '2', 'clubs'),
  ];
  const p2Hand = [
    makeSC('p2-a', '7', 'hearts'),
    makeSC('p2-b', '7', 'diamonds'),
    makeSC('p2-c', 'K', 'clubs'),
    makeSC('p2-d', '3', 'spades'),
  ];

  const playerStates = players.map((p, i) => ({
    playerId: p.id,
    displayName: p.username,
    hand: i === 0 ? p1Hand : i === 1 ? p2Hand : [],
    score: 0,
    isOut: false,
    isBot: false,
    isDealer: i === 0,
  }));

  const board = {
    pegs: players.map((p, idx) => ({
      playerId: p.id,
      color: (['red', 'green', 'blue'] as const)[idx % 3]!,
      frontPeg: 0,
      backPeg: 0,
    })),
    skunkLine: 91,
    doubleskunkLine: 61,
    winScore: 121,
  };

  return {
    version: 1,
    roomId,
    gameId: 'cribbage',
    phase: 'playing',
    players: playerStates,
    currentTurn: players[0]?.id ?? null, // local test user ('test-player-1') leads as non-dealer? dealer=0 so non-dealer would be index 1. We pin p1 (dealer) for UX test convenience. The engine will still accept valid Play actions from the current-turn player.
    turnNumber: 5,
    roundNumber: 1,
    publicData: {
      gamePhase: 'pegging',
      crib: [
        { id: 'cr-1', deckType: 'standard', rank: '4', suit: 'hearts', value: 4, faceUp: false },
        { id: 'cr-2', deckType: 'standard', rank: '6', suit: 'clubs', value: 6, faceUp: false },
        { id: 'cr-3', deckType: 'standard', rank: '8', suit: 'diamonds', value: 8, faceUp: false },
        { id: 'cr-4', deckType: 'standard', rank: '9', suit: 'spades', value: 9, faceUp: false },
      ],
      cutCard: makeSC('starter', 'Q', 'hearts'),
      pegCount: 0,
      pegCards: [],
      pegCardPlayers: [],
      pegPlayOrder: players.map((p) => p.id),
      pegPassedPlayers: [],
      dealerIndex: 0,
      scores: Object.fromEntries(players.map((p) => [p.id, 0])),
      discardedCount: Object.fromEntries(players.map((p) => [p.id, 2])),
    },
    cribbageBoardState: board,
    updatedAt: new Date().toISOString(),
  };
}

export const testRouter = Router();

/**
 * Read the raw game state JSON from Redis. Used by E2E tests to assert
 * that the scheduler is advancing the state without needing a browser
 * client to be connected. Returns `null` if no state exists yet.
 */
testRouter.get('/game-state/:roomId', async (req: Request, res: Response): Promise<void> => {
  const { roomId } = req.params;
  if (!roomId) {
    res.status(400).json({ error: 'roomId is required' });
    return;
  }
  try {
    const raw = await redis.get(`game:state:${roomId}`);
    if (!raw) {
      res.json(null);
      return;
    }
    res.json(JSON.parse(raw));
  } catch (err) {
    logger.error('TEST: game-state read failed', { err });
    res.status(500).json({ error: 'game-state read failed' });
  }
});

/**
 * Force-activate a bot for a given seat, bypassing the 90-second timer.
 * See SPEC.md §9.8 acceptance criteria (last scenario).
 */
testRouter.post('/force-bot-activate', async (req: Request, res: Response): Promise<void> => {
  const { roomId, playerId: inputPlayerId, seatIndex } = req.body as {
    roomId?: string;
    playerId?: string;
    seatIndex?: number;
  };

  if (!roomId || !inputPlayerId) {
    res.status(400).json({ error: 'roomId and playerId are required' });
    return;
  }

  try {
    // Resolve username → UUID if the test passed a username (e.g. 'test-player-2')
    let resolvedPlayerId = inputPlayerId;
    if (!/^[0-9a-f-]{36}$/i.test(inputPlayerId)) {
      const player = await prisma.player.findUnique({
        where: { username: inputPlayerId },
        select: { id: true },
      });
      if (!player) {
        res.status(404).json({ error: `Player '${inputPlayerId}' not found` });
        return;
      }
      resolvedPlayerId = player.id;
    }

    // Publish to the bot:action:{roomId} channel — socket-service's pub-sub subscriber
    // routes this to BotController.activateBot (SPEC.md §5, §9.7).
    if (redis.status === 'wait') await redis.connect();
    await redis.publish(
      `bot:action:${roomId}`,
      JSON.stringify({ type: 'activate', playerId: resolvedPlayerId, seatIndex: seatIndex ?? 0 }),
    );
    logger.info('TEST: force-bot-activate published', {
      roomId,
      playerId: resolvedPlayerId,
      seatIndex,
    });
    res.json({ ok: true, roomId, playerId: resolvedPlayerId });
  } catch (err) {
    logger.error('TEST: force-bot-activate failed', { err });
    res.status(500).json({ error: 'force-bot-activate failed' });
  }
});

/**
 * Force a player rejoin event, bypassing normal socket reconnect flow.
 */
testRouter.post('/force-player-rejoin', async (req: Request, res: Response): Promise<void> => {
  const { roomId, playerId: inputPlayerId } = req.body as {
    roomId?: string;
    playerId?: string;
  };

  if (!roomId || !inputPlayerId) {
    res.status(400).json({ error: 'roomId and playerId are required' });
    return;
  }

  try {
    // Resolve username → UUID if needed
    let resolvedPlayerId = inputPlayerId;
    if (!/^[0-9a-f-]{36}$/i.test(inputPlayerId)) {
      const player = await prisma.player.findUnique({
        where: { username: inputPlayerId },
        select: { id: true },
      });
      if (!player) {
        res.status(404).json({ error: `Player '${inputPlayerId}' not found` });
        return;
      }
      resolvedPlayerId = player.id;
    }

    // Publish to bot:action:{roomId} — socket-service subscriber yields the bot back.
    if (redis.status === 'wait') await redis.connect();
    await redis.publish(
      `bot:action:${roomId}`,
      JSON.stringify({ type: 'yield', playerId: resolvedPlayerId }),
    );
    logger.info('TEST: force-player-rejoin published', {
      roomId,
      playerId: resolvedPlayerId,
    });
    res.json({ ok: true, roomId, playerId: resolvedPlayerId });
  } catch (err) {
    logger.error('TEST: force-player-rejoin failed', { err });
    res.status(500).json({ error: 'force-player-rejoin failed' });
  }
});

/**
 * Seed a room with players for a given game (used by Suites 3, 5, 6, 9).
 * Body: { gameId: string, players: string[] (usernames), hostUsername?: string, status?: 'waiting'|'playing' }
 * Returns: { roomId, players: { id, username }[] }
 */
testRouter.post('/seed-game', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as {
      gameId?: string;
      players?: string[];
      hostUsername?: string;
      status?: string;
    };
    const gameId = body.gameId ?? 'phase10';
    const usernames = body.players ?? ['test-player-1', 'test-player-2'];
    const hostUsername = body.hostUsername ?? usernames[0];

    // Upsert players so tests can reference usernames that haven't been
    // touched by /dev/token yet (otherwise 3p/4p seeds silently create
    // short rosters when only the first two usernames happen to exist).
    for (const username of usernames) {
      await prisma.player.upsert({
        where: { username },
        update: {},
        create: { username, displayName: username, role: 'player' },
      });
    }

    const playerRecords = await prisma.player.findMany({
      where: { username: { in: usernames } },
      select: { id: true, username: true },
    });

    const host = playerRecords.find((p) => p.username === hostUsername);
    if (!host) {
      res.status(404).json({ error: `Host '${hostUsername}' not found` });
      return;
    }

    const shouldStart = body.status !== 'waiting';

    const room = await prisma.room.create({
      data: {
        name: `Test Room ${gameId}`,
        gameId,
        hostId: host.id,
        status: shouldStart ? 'playing' : 'waiting',
        asyncMode: false,
        turnTimerSeconds: 300,
        settings: { seededPlayers: playerRecords.map((p) => p.id) },
      },
    });

    // Populate Redis so socket-service's join_room handler returns a real GameState.
    // Per SPEC.md §5: room:players:{roomId} SET and game:state:{roomId} JSON.
    try {
      if (redis.status === 'wait') await redis.connect();
    } catch {
      // lazyConnect may reject if already connecting — safe to ignore
    }
    const pipeline = redis.pipeline();
    for (const p of playerRecords) {
      pipeline.sadd(`room:players:${room.id}`, p.id);
    }
    // Store room metadata so socket-service can verify host-only actions
    pipeline.set(
      `room:meta:${room.id}`,
      JSON.stringify({ hostId: host.id, gameId, maxPlayers: 6 }),
    );
    if (shouldStart && gameId === 'phase10') {
      const state = buildPhase10TestState(room.id, playerRecords);
      pipeline.set(`game:state:${room.id}`, JSON.stringify(state));
    } else if (shouldStart && gameId === 'cribbage') {
      const scenario = (body as { scenario?: string }).scenario;
      const state =
        scenario === 'cribbage-pegging'
          ? buildCribbagePeggingState(room.id, playerRecords)
          : buildCribbageTestState(room.id, playerRecords);
      pipeline.set(`game:state:${room.id}`, JSON.stringify(state));
    }
    await pipeline.exec();

    logger.info('TEST: seeded game room', {
      roomId: room.id,
      gameId,
      playerCount: playerRecords.length,
      stateInitialized: shouldStart,
    });

    res.json({
      roomId: room.id,
      players: playerRecords,
      hostId: host.id,
      gameId,
    });
  } catch (err) {
    logger.error('TEST: seed-game failed', { err });
    res.status(500).json({ error: 'seed-game failed' });
  }
});

/**
 * Seed a completed game result for leaderboard tests (Suite 8).
 * Body: { gameId: string, winnerUsername: string, rankings: { username: string, score: number, isBot?: boolean }[] }
 * Upserts LeaderboardEntry rows so the leaderboard reflects the completed game within <5s.
 */
testRouter.post(
  '/seed-completed-game',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as {
        gameId?: string;
        winnerUsername?: string;
        rankings?: { username: string; score: number; isBot?: boolean }[];
      };
      const gameId = body.gameId ?? 'phase10';
      const rankings = body.rankings ?? [
        { username: 'test-player-1', score: 100 },
        { username: 'test-player-2', score: 50 },
      ];

      const players = await prisma.player.findMany({
        where: { username: { in: rankings.map((r) => r.username) } },
      });

      const winner = players.find((p) => p.username === body.winnerUsername) ?? players[0];

      // Create a synthetic room for this completed game
      const syntheticRoom = await prisma.room.create({
        data: {
          name: `Completed ${gameId}`,
          gameId,
          hostId: (winner?.id) ?? players[0]?.id ?? 'synthetic',
          status: 'finished',
        },
      });

      const result = await prisma.gameResult.create({
        data: {
          roomId: syntheticRoom.id,
          gameId,
          winnerId: winner?.id ?? null,
          rankings: rankings as unknown as object,
          startedAt: new Date(Date.now() - 60_000),
          endedAt: new Date(),
        },
      });

      // Upsert LeaderboardEntry rows — excluding bots per CLAUDE.md rule 11
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      for (const rank of rankings) {
        if (rank.isBot) continue;
        const player = players.find((p) => p.username === rank.username);
        if (!player) continue;
        const isWinner = winner && player.id === winner.id;

        for (const period of ['monthly', 'allTime'] as const) {
          await prisma.leaderboardEntry.upsert({
            where: {
              playerId_gameId_period_month: {
                playerId: player.id,
                gameId,
                period: period === 'monthly' ? 'monthly' : 'allTime',
                month: period === 'monthly' ? month : '',
              },
            },
            create: {
              playerId: player.id,
              gameId,
              period: period === 'monthly' ? 'monthly' : 'allTime',
              month: period === 'monthly' ? month : '',
              wins: isWinner ? 1 : 0,
              losses: isWinner ? 0 : 1,
              draws: 0,
              points: rank.score,
            },
            update: {
              wins: { increment: isWinner ? 1 : 0 },
              losses: { increment: isWinner ? 0 : 1 },
              points: { increment: rank.score },
            },
          });
        }
      }

      logger.info('TEST: seeded completed game', {
        gameResultId: result.id,
        gameId,
        playerCount: players.length,
      });

      res.json({
        gameResultId: result.id,
        gameId,
        rankings,
      });
    } catch (err) {
      logger.error('TEST: seed-completed-game failed', { err });
      res.status(500).json({ error: 'seed-completed-game failed' });
    }
  },
);

/**
 * Reset test data — truncates all non-seed rows.
 * Preserves the 5 seeded test players and the game catalog.
 */
testRouter.post('/reset', async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info('TEST: resetting test data');

    // Delete in dependency order to avoid FK violations.
    // Note: game_actions and moderation_audit_log are append-only (CLAUDE.md rule 15)
    // — they are NOT deleted here. Tests must work with accumulated data.
    await prisma.$transaction([
      prisma.moderationReport.deleteMany(),
      prisma.muteRecord.deleteMany(),
      prisma.message.deleteMany(),
      prisma.friendRelation.deleteMany(),
      prisma.leaderboardEntry.deleteMany(),
      prisma.gameResult.deleteMany(),
      prisma.room.deleteMany(),
      // Remove non-seed players (keep test-player-* and test-moderator, test-admin)
      prisma.player.deleteMany({
        where: {
          username: {
            notIn: [
              'test-player-1',
              'test-player-2',
              'test-player-3',
              'test-moderator',
              'test-admin',
            ],
          },
        },
      }),
    ]);

    // Also clear Redis state left over from seeded games.
    try {
      if (redis.status === 'wait') await redis.connect();
      const patterns = [
        'game:state:*',
        'game:lock:*',
        'game:actions:*',
        'replay:actions:*',
        'room:players:*',
        'room:spectators:*',
        'room:meta:*',
        'chat:history:*',
        'bot:active:*',
        'bot:queue:*',
        'presence:*',
        'dm:unread:*',
      ];
      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch (err) {
      logger.warn('TEST: Redis reset skipped', { err: String(err) });
    }

    res.json({ ok: true, message: 'Test data reset complete' });
  } catch (err) {
    logger.error('TEST: reset failed', { err });
    res.status(500).json({ error: 'Reset failed' });
  }
});
