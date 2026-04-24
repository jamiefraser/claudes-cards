/**
 * Seed script for Card Platform — Unit 2
 *
 * Seeds:
 *  - 5 test users (§8 Auth Strategy)
 *  - Full game catalog — all launch games (§2.2)
 *
 * Run via: npx prisma db seed
 */

import { PrismaClient, PlayerRole } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Test users (§8)
// ---------------------------------------------------------------------------

const TEST_USERS = [
  { username: 'test-player-1', role: 'player' as PlayerRole, displayName: 'TestPlayer1' },
  { username: 'test-player-2', role: 'player' as PlayerRole, displayName: 'TestPlayer2' },
  { username: 'test-player-3', role: 'player' as PlayerRole, displayName: 'TestPlayer3' },
  { username: 'test-moderator', role: 'moderator' as PlayerRole, displayName: 'TestMod' },
  { username: 'test-admin', role: 'admin' as PlayerRole, displayName: 'TestAdmin' },
];

// ---------------------------------------------------------------------------
// Game catalog (§2.2)
// ---------------------------------------------------------------------------

interface GameEntry {
  id: string;
  name: string;
  category: string;
  minPlayers: number;
  maxPlayers: number;
  supportsAsync: boolean;
}

const GAME_CATALOG: GameEntry[] = [
  // Priority 1 — Rummy Family
  {
    id: 'phase10',
    name: 'Phase 10',
    category: 'rummy',
    minPlayers: 2,
    maxPlayers: 6,
    supportsAsync: true,
  },
  {
    id: 'rummy',
    name: 'Rummy',
    category: 'rummy',
    minPlayers: 2,
    maxPlayers: 6,
    supportsAsync: true,
  },
  {
    id: 'gin-rummy',
    name: 'Gin Rummy',
    category: 'rummy',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAsync: true,
  },
  {
    id: 'canasta',
    name: 'Canasta',
    category: 'rummy',
    // Engine supports three variants: 2p (15-card deal, 2-card draw, 2 canastas
    // to go out), 3p (13-card deal, individual), 4p partnership (11-card deal,
    // classic). See apps/socket-service/src/games/canasta/engine.ts.
    minPlayers: 2,
    maxPlayers: 4,
    supportsAsync: true,
  },

  // Priority 2 — Cribbage
  {
    id: 'cribbage',
    name: 'Cribbage',
    category: 'cribbage',
    minPlayers: 2,
    maxPlayers: 4,
    supportsAsync: true,
  },

  // Priority 3 — Trick-Taking
  {
    id: 'spades',
    name: 'Spades',
    category: 'trick-taking',
    minPlayers: 4,
    maxPlayers: 4,
    supportsAsync: false,
  },
  {
    id: 'hearts',
    name: 'Hearts',
    category: 'trick-taking',
    minPlayers: 4,
    maxPlayers: 4,
    supportsAsync: false,
  },
  {
    id: 'euchre',
    name: 'Euchre',
    category: 'trick-taking',
    minPlayers: 4,
    maxPlayers: 4,
    supportsAsync: false,
  },
  {
    id: 'whist',
    name: 'Whist',
    category: 'trick-taking',
    minPlayers: 4,
    maxPlayers: 4,
    supportsAsync: false,
  },
  {
    id: 'oh-hell',
    name: 'Oh Hell!',
    category: 'trick-taking',
    minPlayers: 3,
    maxPlayers: 7,
    supportsAsync: false,
  },

  // Priority 4 — Other
  {
    id: 'go-fish',
    name: 'Go Fish',
    category: 'other',
    minPlayers: 2,
    maxPlayers: 6,
    supportsAsync: true,
  },
  {
    id: 'crazy-eights',
    name: 'Crazy Eights',
    category: 'other',
    minPlayers: 2,
    maxPlayers: 7,
    supportsAsync: true,
  },
  {
    id: 'war',
    name: 'War',
    category: 'other',
    minPlayers: 2,
    maxPlayers: 4,
    supportsAsync: false,
  },
  {
    id: 'spit',
    name: 'Spit/Speed',
    category: 'other',
    minPlayers: 2,
    maxPlayers: 2,
    supportsAsync: false,
  },
  {
    id: 'idiot',
    name: 'Idiot/Shithead',
    category: 'other',
    minPlayers: 2,
    maxPlayers: 6,
    supportsAsync: false,
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  process.stdout.write('Seeding test users...\n');
  for (const user of TEST_USERS) {
    await prisma.player.upsert({
      where: { username: user.username },
      update: {
        role: user.role,
        displayName: user.displayName,
      },
      create: {
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      },
    });
  }
  process.stdout.write(`Seeded ${TEST_USERS.length} test users.\n`);

  process.stdout.write('Seeding game catalog...\n');
  // Clean up legacy catalog IDs that didn't match engine registrations.
  // See registry.normalize(): 'spit-speed' → 'spitspeed' ≠ engine 'spit'.
  await prisma.gameCatalog.deleteMany({
    where: { id: { in: ['spit-speed', 'idiot-shithead'] } },
  });
  for (const game of GAME_CATALOG) {
    await prisma.gameCatalog.upsert({
      where: { id: game.id },
      update: {
        name: game.name,
        category: game.category,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        supportsAsync: game.supportsAsync,
        enabled: true,
      },
      create: {
        id: game.id,
        name: game.name,
        category: game.category,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        supportsAsync: game.supportsAsync,
        enabled: true,
      },
    });
  }
  process.stdout.write(`Seeded ${GAME_CATALOG.length} game catalog entries.\n`);
}

main()
  .catch((err) => {
    process.stderr.write(`Seed failed: ${String(err)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
