/**
 * Tests for per-recipient game state redaction (SPEC.md §22).
 *
 * The rule under test: a client must never see another player's hand.
 * Laid-down/face-up data in publicData is public and should pass through
 * untouched.
 */

import {
  redactStateForRecipient,
  redactDeltaForRecipient,
} from '../src/utils/gameStateRedaction';
import type { GameState, GameStateDelta, Card, PlayerState } from '@card-platform/shared-types';

function card(id: string, value = 5): Card {
  return {
    id,
    deckType: 'phase10',
    phase10Type: 'number',
    phase10Color: 'red',
    value,
    faceUp: false,
  };
}

function player(id: string, hand: Card[]): PlayerState {
  return {
    playerId: id,
    displayName: id,
    hand,
    score: 0,
    isOut: false,
    isBot: false,
  };
}

function state(): GameState {
  return {
    version: 7,
    roomId: 'r1',
    gameId: 'phase10',
    phase: 'playing',
    players: [
      player('alice', [card('a1', 3), card('a2', 8)]),
      player('bob', [card('b1', 5), card('b2', 12), card('b3', 1)]),
      player('carol', [card('c1', 7)]),
    ],
    currentTurn: 'alice',
    turnNumber: 1,
    roundNumber: 1,
    publicData: {
      discardTop: card('d1', 9),
      laidDownPhases: { alice: [{ type: 'set', cardIds: ['a-laid-1', 'a-laid-2'] }] },
    },
    updatedAt: '2026-04-19T00:00:00.000Z',
  };
}

describe('redactStateForRecipient', () => {
  it('preserves the recipient\'s own hand verbatim', () => {
    const redacted = redactStateForRecipient(state(), 'bob');
    const bob = redacted.players.find((p) => p.playerId === 'bob')!;
    expect(bob.hand).toEqual(state().players[1]!.hand);
  });

  it('replaces opponents\' cards with face-down placeholders but preserves hand length and ids', () => {
    const redacted = redactStateForRecipient(state(), 'bob');
    const alice = redacted.players.find((p) => p.playerId === 'alice')!;
    expect(alice.hand).toHaveLength(2);
    expect(alice.hand.map((c) => c.id)).toEqual(['a1', 'a2']);
    alice.hand.forEach((c) => {
      expect(c.faceUp).toBe(false);
      expect(c.value).toBe(0);
      // Content fields must not leak
      expect((c as Card & { phase10Color?: string }).phase10Color).toBeUndefined();
      expect((c as Card & { phase10Type?: string }).phase10Type).toBeUndefined();
    });
  });

  it('treats spectators (no matching playerId) as "every hand is an opponent"', () => {
    const redacted = redactStateForRecipient(state(), '__spectator__');
    for (const p of redacted.players) {
      p.hand.forEach((c) => expect(c.value).toBe(0));
    }
  });

  it('leaves publicData untouched (laid-down melds are public)', () => {
    const redacted = redactStateForRecipient(state(), 'bob');
    expect(redacted.publicData).toEqual(state().publicData);
  });

  it('returns state unchanged when players/hand are missing (defensive)', () => {
    const malformed = { version: 1, roomId: 'x' } as unknown as GameState;
    expect(() => redactStateForRecipient(malformed, 'bob')).not.toThrow();
  });
});

describe('redactDeltaForRecipient', () => {
  function delta(): GameStateDelta {
    return {
      version: 8,
      prevVersion: 7,
      roomId: 'r1',
      playerUpdates: {
        alice: { hand: [card('a1', 3)] },
        bob: { hand: [card('b1', 5), card('b2', 12)] },
      },
      updatedAt: '2026-04-19T00:00:01.000Z',
    };
  }

  it('preserves the recipient\'s own hand update verbatim', () => {
    const redacted = redactDeltaForRecipient(delta(), 'bob');
    expect(redacted.playerUpdates!['bob']!.hand).toEqual([card('b1', 5), card('b2', 12)]);
  });

  it('redacts other players\' hand updates', () => {
    const redacted = redactDeltaForRecipient(delta(), 'bob');
    const alice = redacted.playerUpdates!['alice']!;
    expect(alice.hand).toHaveLength(1);
    expect(alice.hand![0]!.value).toBe(0);
    expect(alice.hand![0]!.id).toBe('a1'); // id preserved for React keys
  });

  it('preserves non-hand fields in other players\' updates (score, isBot, etc.)', () => {
    const d: GameStateDelta = {
      ...delta(),
      playerUpdates: {
        alice: { score: 42, isBot: true, hand: [card('a1')] },
      },
    };
    const redacted = redactDeltaForRecipient(d, 'bob');
    const alice = redacted.playerUpdates!['alice']!;
    expect(alice.score).toBe(42);
    expect(alice.isBot).toBe(true);
  });

  it('leaves deltas without playerUpdates untouched', () => {
    const d: GameStateDelta = {
      version: 5,
      prevVersion: 4,
      roomId: 'r1',
      updatedAt: '2026-04-19T00:00:02.000Z',
      currentTurn: 'alice',
    };
    expect(redactDeltaForRecipient(d, 'bob')).toEqual(d);
  });
});
