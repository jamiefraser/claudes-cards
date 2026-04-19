/**
 * Per-recipient redaction of game state and state deltas.
 *
 * The problem this solves: every game_state_sync / game_state_delta is
 * broadcast to the whole Socket.io room. Before this module existed the
 * payload carried every player's hand verbatim, which meant:
 *   - Opponents could trivially inspect each other's cards in DevTools.
 *   - Spectators likewise saw everything face-up.
 *
 * The rule: a player's `hand` array is private to that player. Everything
 * else in `PlayerState` and `GameState` is considered public (see
 * SPEC.md §22). Face-up/laid-down cards live in publicData and stay
 * untouched.
 *
 * Redaction replaces each hidden card with a stable-id placeholder so the
 * client can keep rendering the correct hand size and React keys remain
 * stable across re-renders.
 */

import type { Server, Namespace } from 'socket.io';
import type {
  Card,
  GameState,
  GameStateDelta,
  PlayerState,
} from '@card-platform/shared-types';
import { logger } from './logger';

/**
 * Build a placeholder card that preserves identity/deckType so clients
 * can render a card-back without leaking face values or colours.
 */
function redactCard(c: Card): Card {
  return {
    id: c.id,
    deckType: c.deckType,
    value: 0,
    faceUp: false,
  };
}

/**
 * Redact another player's private fields for the recipient.
 * Preserves hand length (structural info is public) but hides every card.
 */
function redactPlayer(player: PlayerState, recipientPlayerId: string): PlayerState {
  if (player.playerId === recipientPlayerId) return player;
  return {
    ...player,
    hand: player.hand.map(redactCard),
  };
}

/**
 * Produce a GameState snapshot safe to send to `recipientPlayerId`.
 * Spectators should be passed a playerId that doesn't match any seated
 * player (the redactor simply treats every hand as an opponent's).
 */
export function redactStateForRecipient(
  state: GameState,
  recipientPlayerId: string,
): GameState {
  // Defensive: older persisted payloads (and unit tests) sometimes omit
  // players/hand arrays. We don't want the redactor to be the thing that
  // throws on malformed state — the caller would emit game_error and the
  // client would never see any state at all.
  if (!Array.isArray(state.players)) return state;
  return {
    ...state,
    players: state.players.map((p) =>
      Array.isArray(p.hand) ? redactPlayer(p, recipientPlayerId) : p,
    ),
  };
}

/**
 * Produce a GameStateDelta safe to send to `recipientPlayerId`.
 * Only `playerUpdates[<other>].hand` needs masking; everything else is
 * either public or already scoped to the recipient.
 */
export function redactDeltaForRecipient(
  delta: GameStateDelta,
  recipientPlayerId: string,
): GameStateDelta {
  if (!delta.playerUpdates) return delta;
  const redactedUpdates: Record<string, Partial<PlayerState>> = {};
  for (const [playerId, update] of Object.entries(delta.playerUpdates)) {
    if (!update) continue;
    if (playerId === recipientPlayerId || !update.hand) {
      redactedUpdates[playerId] = update;
      continue;
    }
    redactedUpdates[playerId] = {
      ...update,
      hand: update.hand.map(redactCard),
    };
  }
  return {
    ...delta,
    playerUpdates: redactedUpdates,
  };
}

/**
 * Emit a per-recipient filtered `game_state_delta` to every socket in
 * the room. Using fetchSockets() so the same code path works with the
 * Redis adapter when we eventually scale out.
 */
export async function emitFilteredDelta(
  io: Server | Namespace,
  roomId: string,
  delta: GameStateDelta,
): Promise<void> {
  const nsp: Namespace = 'of' in io ? io.of('/game') : io;
  const sockets = await nsp.in(roomId).fetchSockets();
  for (const s of sockets) {
    const recipientId = (s.data as { user?: { playerId?: string } })?.user?.playerId;
    if (!recipientId) {
      // No auth context — safest is the spectator view (all hands redacted).
      s.emit('game_state_delta', {
        delta: redactDeltaForRecipient(delta, '__spectator__'),
      });
      continue;
    }
    s.emit('game_state_delta', {
      delta: redactDeltaForRecipient(delta, recipientId),
    });
  }
  logger.debug('emitFilteredDelta: fanned out', {
    roomId,
    version: delta.version,
    recipients: sockets.length,
  });
}

/**
 * Emit a per-recipient filtered `game_state_sync` to every socket in
 * the room. Used by startGame / rejoin flows where every client needs
 * to bootstrap off a fresh snapshot.
 */
export async function emitFilteredSync(
  io: Server | Namespace,
  roomId: string,
  state: GameState,
): Promise<void> {
  const nsp: Namespace = 'of' in io ? io.of('/game') : io;
  const sockets = await nsp.in(roomId).fetchSockets();
  for (const s of sockets) {
    const recipientId = (s.data as { user?: { playerId?: string } })?.user?.playerId;
    const forId = recipientId ?? '__spectator__';
    s.emit('game_state_sync', { state: redactStateForRecipient(state, forId) });
  }
}
