/**
 * Compile-time type export check for @card-platform/shared-types.
 * If this file compiles without errors, all types are correctly defined and exported.
 * Runtime assertions are minimal — the value of this test is TypeScript compilation.
 */
import {
  // auth.ts
  PlayerRole,
  PlayerProfile,
  DevTokenPayload,

  // bot.ts
  BotSeatInfo,
  BotActivatedPayload,
  BotYieldedPayload,
  IBotStrategy,
  BotActivationPolicy,

  // cards.ts
  Suit,
  Rank,
  DeckType,
  Phase10Color,
  Phase10CardType,
  Card,
  Deck,

  // chat.ts
  ChatMessage,

  // friends.ts
  OnlineStatus,
  FriendEntry,
  FriendRequest,
  DMInboxEntry,

  // gameEngine.ts
  IGameEngine,
  GameConfig,
  PlayerRanking,

  // gameState.ts
  GamePhase,
  PlayerAction,
  GameState,
  GameStateDelta,
  GameAction,
  CribbageBoardState,
  CribbagePegSet,

  // leaderboard.ts
  LeaderboardEntry,
  LeaderboardQuery,

  // rooms.ts
  RoomSettings,
  Room,
  RoomListQuery,
  CreateRoomPayload,

  // socket.ts
  JoinRoomPayload,
  RejoinRoomPayload,
  GameActionPayload,
  GameStateSyncPayload,
  GameStateDeltaPayload,
  RoomListPayload,
  RoomUpdatedPayload,
  RoomRemovedPayload,
  PresenceUpdatedPayload,
  ChatMessagePayload,
  LeaderboardUpdatedPayload,
  FriendRequestPayload,
  FriendStatusPayload,
  DMMessagePayload,
  SpectatorJoinedPayload,
  GameErrorPayload,
  ModerationMutedPayload,
  AdminReportReceivedPayload,
  BotActivatedSocketPayload,
  BotYieldedSocketPayload,

  // sound.ts
  SoundEvent,
  SoundCredit,

  // admin.ts
  ModerationReport,
  MuteRecord,
  MuteDuration,
  ApplyMutePayload,
  AdminDashboardStats,
  GameCatalogEntry,
  AdminPlayerProfile,
  PaginatedReports,
  ReportStatus,
  ModerationAuditLog,
} from '../src';

describe('shared-types', () => {
  it('exports all types (compile-time check)', () => {
    // If this file compiles, all types are correctly exported.
    // The runtime assertion is trivially true.
    expect(true).toBe(true);
  });

  it('PlayerRole has correct literal values', () => {
    const role: PlayerRole = 'player';
    expect(['player', 'moderator', 'admin']).toContain(role);
  });

  it('Suit has correct literal values', () => {
    const suit: Suit = 'hearts';
    expect(['hearts', 'diamonds', 'clubs', 'spades']).toContain(suit);
  });

  it('DeckType has correct literal values', () => {
    const deckType: DeckType = 'standard';
    expect(['standard', 'phase10']).toContain(deckType);
  });

  it('MuteDuration has correct literal values', () => {
    const duration: MuteDuration = '1hr';
    expect(['15min', '1hr', '24hr', '7day', 'permanent']).toContain(duration);
  });

  it('SoundEvent has correct literal values', () => {
    const event: SoundEvent = 'card-deal';
    const validEvents: SoundEvent[] = [
      'card-deal', 'card-flip', 'card-discard', 'card-draw',
      'card-shuffle', 'phase-complete', 'round-win', 'game-win',
      'game-lose', 'skip-played', 'notification', 'peg-move',
    ];
    expect(validEvents).toContain(event);
  });

  it('ReportStatus has correct literal values', () => {
    const status: ReportStatus = 'PENDING';
    expect(['PENDING', 'ACTIONED', 'DISMISSED']).toContain(status);
  });

  it('OnlineStatus has correct literal values', () => {
    const status: OnlineStatus = 'online';
    expect(['online', 'in-game', 'away', 'offline']).toContain(status);
  });

  it('Phase10Color has correct literal values', () => {
    const color: Phase10Color = 'red';
    expect(['red', 'blue', 'green', 'yellow']).toContain(color);
  });

  it('Phase10CardType has correct literal values', () => {
    const type: Phase10CardType = 'number';
    expect(['number', 'wild', 'skip']).toContain(type);
  });

  it('GamePhase has correct literal values', () => {
    const phase: GamePhase = 'waiting';
    const validPhases: GamePhase[] = ['waiting', 'dealing', 'playing', 'scoring', 'ended'];
    expect(validPhases).toContain(phase);
  });

  it('CribbageBoardState has required constant fields', () => {
    const board: CribbageBoardState = {
      pegs: [],
      skunkLine: 91,
      doubleskunkLine: 61,
      winScore: 121,
    };
    expect(board.skunkLine).toBe(91);
    expect(board.doubleskunkLine).toBe(61);
    expect(board.winScore).toBe(121);
  });

  it('BotActivationPolicy has required constant fields', () => {
    const policy: BotActivationPolicy = {
      activateOnTimerExpiry: true,
      eligibleSeats: 'any-disconnected-human-seat',
      humanCanReclaimAtAnyTime: true,
      botResultsExcludedFromLeaderboard: true,
      botsAreSilent: true,
      botLabelVisibleToAllParticipants: true,
      thinkTimeMin: 800,
      thinkTimeMax: 2500,
    };
    expect(policy.activateOnTimerExpiry).toBe(true);
    expect(policy.thinkTimeMin).toBe(800);
    expect(policy.thinkTimeMax).toBe(2500);
  });

  // Structural shape checks — verify key fields exist on interfaces using object literals
  it('PlayerProfile has required fields', () => {
    const profile: PlayerProfile = {
      id: 'uuid-1',
      username: 'testuser',
      displayName: 'Test User',
      avatarUrl: null,
      role: 'player',
      createdAt: '2026-01-01T00:00:00Z',
    };
    expect(profile.id).toBe('uuid-1');
    expect(profile.role).toBe('player');
  });

  it('Room has required fields', () => {
    const room: Room = {
      id: 'room-1',
      gameId: 'phase10',
      hostId: 'player-1',
      players: [],
      settings: {
        maxPlayers: 4,
        asyncMode: false,
        turnTimerSeconds: null,
        isPrivate: false,
        password: null,
      },
      status: 'waiting',
      createdAt: '2026-01-01T00:00:00Z',
    };
    expect(room.gameId).toBe('phase10');
  });

  it('LeaderboardEntry has required fields', () => {
    const entry: LeaderboardEntry = {
      playerId: 'p1',
      displayName: 'Player 1',
      avatarUrl: null,
      gameId: 'phase10',
      wins: 10,
      losses: 5,
      gamesPlayed: 15,
      rank: 1,
      period: 'monthly',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(entry.rank).toBe(1);
  });

  it('GameAction has isBot flag', () => {
    const action: GameAction = {
      id: 'action-1',
      roomId: 'room-1',
      gameId: 'phase10',
      playerId: 'player-1',
      action: { type: 'draw' },
      appliedAt: '2026-01-01T00:00:00Z',
      resultVersion: 1,
      isBot: false,
    };
    expect(action.isBot).toBe(false);
  });

  it('ModerationReport has correct status type', () => {
    const report: ModerationReport = {
      id: 'report-1',
      reportedByPlayerId: 'p1',
      reportedPlayerId: 'p2',
      reason: 'Offensive language',
      status: 'PENDING',
      createdAt: '2026-01-01T00:00:00Z',
    };
    expect(report.status).toBe('PENDING');
  });
});
