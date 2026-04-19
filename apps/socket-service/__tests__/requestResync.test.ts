/**
 * Tests for request_resync handler (SPEC.md §22).
 *
 * The handler's job: when a client reports a version gap, reply with a
 * per-recipient-redacted snapshot of the current game state so the
 * client can reconcile without relying on possibly-lost intermediate
 * deltas.
 */

jest.mock('../src/redis/client', () => ({
  redis: {
    get: jest.fn(),
  },
}));

import { requestResyncHandler } from '../src/handlers/requestResync';
import { redis } from '../src/redis/client';

const mockRedis = redis as jest.Mocked<typeof redis>;

function makeSocket(playerId: string) {
  return {
    data: { user: { playerId } },
    emit: jest.fn(),
  };
}

describe('requestResyncHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emits game_error when roomId is missing', async () => {
    const socket = makeSocket('alice');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requestResyncHandler(socket as any, { roomId: '', currentVersion: 0 });
    expect(socket.emit).toHaveBeenCalledWith(
      'game_error',
      expect.objectContaining({ code: 'INVALID_PAYLOAD' }),
    );
  });

  it('emits game_state_sync with a redacted snapshot when state exists', async () => {
    const fullState = {
      version: 12,
      roomId: 'r1',
      gameId: 'phase10',
      phase: 'playing',
      players: [
        {
          playerId: 'alice',
          displayName: 'Alice',
          hand: [
            { id: 'a1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'red', value: 3, faceUp: false },
          ],
          score: 0,
          isOut: false,
          isBot: false,
        },
        {
          playerId: 'bob',
          displayName: 'Bob',
          hand: [
            { id: 'b1', deckType: 'phase10', phase10Type: 'number', phase10Color: 'blue', value: 9, faceUp: false },
          ],
          score: 0,
          isOut: false,
          isBot: false,
        },
      ],
      currentTurn: 'alice',
      turnNumber: 1,
      roundNumber: 1,
      publicData: {},
      updatedAt: '2026-04-19T00:00:00.000Z',
    };
    (mockRedis.get as jest.Mock).mockResolvedValue(JSON.stringify(fullState));

    const socket = makeSocket('alice');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requestResyncHandler(socket as any, { roomId: 'r1', currentVersion: 10 });

    const call = socket.emit.mock.calls.find(([event]: string[]) => event === 'game_state_sync');
    expect(call).toBeDefined();
    const snapshotPlayers = call![1].state.players;
    // Alice sees her own hand.
    expect(snapshotPlayers[0].hand[0].value).toBe(3);
    // Bob's card is redacted.
    expect(snapshotPlayers[1].hand[0].value).toBe(0);
    expect(snapshotPlayers[1].hand[0].id).toBe('b1'); // stable id for keys
  });

  it('emits game_state_sync with null state when no state exists', async () => {
    (mockRedis.get as jest.Mock).mockResolvedValue(null);
    const socket = makeSocket('alice');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requestResyncHandler(socket as any, { roomId: 'r1', currentVersion: 0 });

    const call = socket.emit.mock.calls.find(([event]: string[]) => event === 'game_state_sync');
    expect(call).toBeDefined();
    expect(call![1].state).toBeNull();
  });

  it('emits game_error when Redis throws', async () => {
    (mockRedis.get as jest.Mock).mockRejectedValue(new Error('redis down'));
    const socket = makeSocket('alice');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await requestResyncHandler(socket as any, { roomId: 'r1', currentVersion: 0 });

    expect(socket.emit).toHaveBeenCalledWith(
      'game_error',
      expect.objectContaining({ code: 'RESYNC_FAILED' }),
    );
  });
});
