/**
 * Schema integration tests — Unit 2
 *
 * These tests run against the real PostgreSQL database.
 * They verify that all required tables exist and contain the seed data.
 *
 * Run after: npx prisma migrate dev && npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Players seed data
// ---------------------------------------------------------------------------

describe('Player seed data', () => {
  const expectedUsers = [
    { username: 'test-player-1', role: 'player', displayName: 'TestPlayer1' },
    { username: 'test-player-2', role: 'player', displayName: 'TestPlayer2' },
    { username: 'test-player-3', role: 'player', displayName: 'TestPlayer3' },
    { username: 'test-moderator', role: 'moderator', displayName: 'TestMod' },
    { username: 'test-admin', role: 'admin', displayName: 'TestAdmin' },
  ];

  it('has all 5 test users', async () => {
    const players = await prisma.player.findMany({
      where: {
        username: { in: expectedUsers.map((u) => u.username) },
      },
      select: { username: true, role: true, displayName: true },
    });
    expect(players).toHaveLength(5);
  });

  it.each(expectedUsers)('test user $username has correct role and displayName', async ({ username, role, displayName }) => {
    const player = await prisma.player.findUnique({ where: { username } });
    expect(player).not.toBeNull();
    expect(player!.role).toBe(role);
    expect(player!.displayName).toBe(displayName);
  });
});

// ---------------------------------------------------------------------------
// Game catalog seed data
// ---------------------------------------------------------------------------

describe('GameCatalog seed data', () => {
  const expectedGames = [
    'phase10',
    'rummy',
    'gin-rummy',
    'canasta',
    'cribbage',
    'spades',
    'hearts',
    'euchre',
    'whist',
    'oh-hell',
    'go-fish',
    'crazy-eights',
    'war',
    'spit',
    'idiot',
  ];

  it('has all 15 launch games', async () => {
    const games = await prisma.gameCatalog.findMany({
      where: { id: { in: expectedGames } },
    });
    expect(games).toHaveLength(15);
  });

  it.each(expectedGames)('game %s exists and is enabled', async (gameId) => {
    const game = await prisma.gameCatalog.findUnique({ where: { id: gameId } });
    expect(game).not.toBeNull();
    expect(game!.enabled).toBe(true);
  });

  it('phase10 supports async', async () => {
    const game = await prisma.gameCatalog.findUnique({ where: { id: 'phase10' } });
    expect(game!.supportsAsync).toBe(true);
  });

  it('war does not support async', async () => {
    const game = await prisma.gameCatalog.findUnique({ where: { id: 'war' } });
    expect(game!.supportsAsync).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GameAction table (append-only §11.2 / Story 8.6)
// ---------------------------------------------------------------------------

describe('GameAction table', () => {
  const testRoomId = 'test-room-schema-test';

  afterAll(async () => {
    // Clean up test records — GameAction is append-only in production
    // but we must clean up in tests to keep the db tidy
    await prisma.gameAction.deleteMany({ where: { roomId: testRoomId } });
  });

  it('can insert a human GameAction and query it back', async () => {
    const created = await prisma.gameAction.create({
      data: {
        roomId: testRoomId,
        gameId: 'phase10',
        playerId: 'player-uuid-test',
        actionJson: { type: 'draw', source: 'deck' },
        isBot: false,
        resultVersion: 1,
      },
    });

    expect(created.id).toBeDefined();
    expect(created.isBot).toBe(false);
    expect(created.appliedAt).toBeInstanceOf(Date);
  });

  it('can insert a bot GameAction with isBot=true', async () => {
    const created = await prisma.gameAction.create({
      data: {
        roomId: testRoomId,
        gameId: 'phase10',
        playerId: 'bot:player-uuid-test',
        actionJson: { type: 'discard', cardId: 'r-7' },
        isBot: true,
        resultVersion: 2,
      },
    });

    expect(created.isBot).toBe(true);
  });

  it('can query actions by roomId ordered by appliedAt', async () => {
    const actions = await prisma.gameAction.findMany({
      where: { roomId: testRoomId },
      orderBy: { appliedAt: 'asc' },
    });

    expect(actions.length).toBeGreaterThanOrEqual(2);
    // Verify ordering
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i].appliedAt.getTime()).toBeGreaterThanOrEqual(
        actions[i - 1].appliedAt.getTime(),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// ModerationAuditLog table (append-only §22 Story 11.6)
// ---------------------------------------------------------------------------

describe('ModerationAuditLog table', () => {
  const testModeratorId = 'test-mod-uuid';
  const testTargetId = 'test-target-uuid';

  afterAll(async () => {
    await prisma.moderationAuditLog.deleteMany({
      where: { moderatorId: testModeratorId },
    });
  });

  it('can insert a ModerationAuditLog entry and query it back', async () => {
    const created = await prisma.moderationAuditLog.create({
      data: {
        actionType: 'mute',
        moderatorId: testModeratorId,
        targetPlayerId: testTargetId,
        reason: 'Abusive language in chat',
        metadata: { duration: '1hr' },
      },
    });

    expect(created.id).toBeDefined();
    expect(created.actionType).toBe('mute');
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  it('can query audit log entries by targetPlayerId', async () => {
    const entries = await prisma.moderationAuditLog.findMany({
      where: { targetPlayerId: testTargetId },
      orderBy: { createdAt: 'desc' },
    });

    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].targetPlayerId).toBe(testTargetId);
  });
});

// ---------------------------------------------------------------------------
// MuteRecord table (§22 Story 11.6)
// ---------------------------------------------------------------------------

describe('MuteRecord table', () => {
  let seededPlayerId: string;

  beforeAll(async () => {
    const player = await prisma.player.findUnique({
      where: { username: 'test-player-1' },
    });
    seededPlayerId = player!.id;
  });

  afterAll(async () => {
    await prisma.muteRecord.deleteMany({
      where: { playerId: seededPlayerId, mutedByModId: 'test-mod-uuid' },
    });
  });

  it('can insert a MuteRecord linked to a Player', async () => {
    const created = await prisma.muteRecord.create({
      data: {
        playerId: seededPlayerId,
        mutedByModId: 'test-mod-uuid',
        reason: 'Spam',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });

    expect(created.id).toBeDefined();
    expect(created.playerId).toBe(seededPlayerId);
    expect(created.expiresAt).not.toBeNull();
  });

  it('can insert a permanent MuteRecord (expiresAt null)', async () => {
    const created = await prisma.muteRecord.create({
      data: {
        playerId: seededPlayerId,
        mutedByModId: 'test-mod-uuid',
        reason: 'Repeated violations',
        expiresAt: null,
      },
    });

    expect(created.expiresAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ModerationReport table (§22 Story 11.6)
// ---------------------------------------------------------------------------

describe('ModerationReport table', () => {
  afterAll(async () => {
    await prisma.moderationReport.deleteMany({
      where: { reason: 'Schema test report' },
    });
  });

  it('can insert a ModerationReport with default PENDING status', async () => {
    const created = await prisma.moderationReport.create({
      data: {
        reportedByPlayerId: 'reporter-uuid',
        reportedPlayerId: 'reported-uuid',
        reason: 'Schema test report',
      },
    });

    expect(created.id).toBeDefined();
    expect(created.status).toBe('PENDING');
    expect(created.actionedAt).toBeNull();
    expect(created.actionedByModId).toBeNull();
  });

  it('can update a ModerationReport to ACTIONED status', async () => {
    const report = await prisma.moderationReport.create({
      data: {
        reportedByPlayerId: 'reporter-uuid-2',
        reportedPlayerId: 'reported-uuid-2',
        reason: 'Schema test report',
      },
    });

    const updated = await prisma.moderationReport.update({
      where: { id: report.id },
      data: {
        status: 'ACTIONED',
        actionedAt: new Date(),
        actionedByModId: 'mod-uuid',
      },
    });

    expect(updated.status).toBe('ACTIONED');
    expect(updated.actionedAt).not.toBeNull();
  });
});
