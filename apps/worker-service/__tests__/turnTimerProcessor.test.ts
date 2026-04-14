/**
 * Turn Timer Processor Tests — Unit 20
 *
 * Verifies that the turnTimer processor publishes the correct
 * bot:action:{roomId} message to Redis when a turn timer fires.
 *
 * Per SPEC.md §20 Story 9.4 and Redis Key Schema §5.
 */

import type { Job } from 'bullmq';
import type { TurnTimerJobPayload } from '../src/processors/turnTimer.processor';

// Mock ioredis before any imports
const mockPublish = jest.fn().mockResolvedValue(1);
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    publish: mockPublish,
    connect: mockConnect,
    disconnect: mockDisconnect,
    on: jest.fn(),
    status: 'ready',
  }));
});

// Mock winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}));

import { processTurnTimer } from '../src/processors/turnTimer.processor';

describe('processTurnTimer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes to bot:action:{roomId} channel with activate type', async () => {
    const payload: TurnTimerJobPayload = {
      roomId: 'room-123',
      playerId: 'player-456',
      seatIndex: 2,
    };

    const mockJob = { data: payload } as Job<TurnTimerJobPayload>;
    await processTurnTimer(mockJob);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledWith(
      'bot:action:room-123',
      JSON.stringify({ type: 'activate', playerId: 'player-456', seatIndex: 2 }),
    );
  });

  it('publishes to the correct channel when roomId contains special characters', async () => {
    const payload: TurnTimerJobPayload = {
      roomId: 'room-abc-def',
      playerId: 'player-789',
      seatIndex: 0,
    };

    const mockJob = { data: payload } as Job<TurnTimerJobPayload>;
    await processTurnTimer(mockJob);

    expect(mockPublish).toHaveBeenCalledWith(
      'bot:action:room-abc-def',
      expect.stringContaining('"type":"activate"'),
    );
  });

  it('includes seatIndex in published message', async () => {
    const payload: TurnTimerJobPayload = {
      roomId: 'room-xyz',
      playerId: 'player-abc',
      seatIndex: 4,
    };

    const mockJob = { data: payload } as Job<TurnTimerJobPayload>;
    await processTurnTimer(mockJob);

    const publishedMessage = JSON.parse(mockPublish.mock.calls[0][1]);
    expect(publishedMessage.seatIndex).toBe(4);
    expect(publishedMessage.playerId).toBe('player-abc');
    expect(publishedMessage.type).toBe('activate');
  });
});
