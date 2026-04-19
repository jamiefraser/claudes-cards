/**
 * Game state types shared between the engine, socket service, and frontend.
 * SPEC.md §11.2 and §11.4.
 */
import type { Card } from './cards.js';

/** The phase of a game at the table level. */
export type GamePhase =
  | 'waiting'    // Room created, not enough players
  | 'dealing'    // Cards being distributed
  | 'playing'    // Active gameplay
  | 'scoring'    // Round ended, computing scores
  | 'ended';     // Game over

/**
 * A player action submitted to the game engine.
 * The `type` and optional payload are game-specific.
 * Common action types: 'draw', 'discard', 'play', 'pass', 'lay-down', 'hit-meld', etc.
 */
export interface PlayerAction {
  type: string;
  /** Card IDs involved in the action, if applicable. */
  cardIds?: string[];
  /** Arbitrary game-specific data (e.g. which meld to hit, which phase). */
  payload?: Record<string, unknown>;
}

/** Per-player state snapshot within a GameState. */
export interface PlayerState {
  playerId: string;
  displayName: string;
  /** Cards in this player's hand. Only faceUp=true cards are visible to others. */
  hand: Card[];
  /** Game-specific score (e.g. phase number, point total). */
  score: number;
  /** Whether this player has gone out / finished this round. */
  isOut: boolean;
  /** True if this seat is currently bot-controlled. */
  isBot: boolean;
  /** Phase 10 specific: current phase number (1–10). */
  currentPhase?: number;
  /** Phase 10 specific: whether the player has laid down their phase this round. */
  phaseLaidDown?: boolean;
  /** Cribbage specific: whether this player is the current dealer. */
  isDealer?: boolean;
}

/**
 * The canonical full game state object.
 * Stored in Redis (game:state:{roomId}) as JSON and broadcast via game_state_sync.
 * Version increments on every successful applyAction call.
 */
export interface GameState {
  /** Monotonically increasing counter. Used by clients to detect out-of-order updates. */
  version: number;
  roomId: string;
  gameId: string;
  phase: GamePhase;
  players: PlayerState[];
  /** playerId of the player whose turn it currently is. */
  currentTurn: string | null;
  /** Turn number within the current round. */
  turnNumber: number;
  /** Round number within the game. */
  roundNumber: number;
  /** Game-specific public data (e.g. draw pile size, discard pile top card). */
  publicData: Record<string, unknown>;
  /** ISO 8601 timestamp of the last state change. */
  updatedAt: string;
  /** Cribbage only: board state for visual rendering. Null for all other games. */
  cribbageBoardState?: CribbageBoardState;
}

/**
 * A partial update to GameState, used by game_state_delta socket events.
 * Only fields that changed are included.
 */
export interface GameStateDelta {
  version: number;
  /**
   * The version this delta was computed FROM. Clients must validate
   * `prevVersion === currentlyAppliedVersion` before applying; on
   * mismatch (a dropped earlier delta) they emit `request_resync` and
   * apply the server's full state snapshot instead. See SPEC.md §22.
   * Optional for back-compat with older recorded payloads; new server
   * code always populates it.
   */
  prevVersion?: number;
  roomId: string;
  /** Partial player state updates keyed by playerId. */
  playerUpdates?: Partial<Record<string, Partial<PlayerState>>>;
  currentTurn?: string | null;
  phase?: GamePhase;
  publicData?: Partial<Record<string, unknown>>;
  updatedAt: string;
  cribbageBoardState?: CribbageBoardState;
}

/**
 * An immutable record of a single game action.
 * Appended to the game_actions PostgreSQL table and the replay:actions:{roomId} Redis list.
 * SPEC.md §11.2. This table is append-only — never DELETE.
 */
export interface GameAction {
  /** UUID */
  id: string;
  roomId: string;
  gameId: string;
  /** 'bot:{playerId}' for bot actions */
  playerId: string;
  action: PlayerAction;
  /** ISO 8601 */
  appliedAt: string;
  /** GameState.version after this action was applied */
  resultVersion: number;
  isBot: boolean;
}

/**
 * Cribbage board state — embedded in GameState.cribbageBoardState.
 * Not a DB model; lives in the GameState JSON blob.
 * SPEC.md §11.4.
 */
export interface CribbageBoardState {
  /** Each player has a peg set. */
  pegs: CribbagePegSet[];
  /** Always 91 in standard cribbage. */
  skunkLine: 91;
  /** Always 61. */
  doubleskunkLine: 61;
  /** Always 121. */
  winScore: 121;
}

/**
 * The two pegs (front and back) for one player on the cribbage board.
 * SPEC.md §11.4.
 */
export interface CribbagePegSet {
  playerId: string;
  /** Assigned by seat index: red=0, blue=1, green=2. */
  color: 'red' | 'green' | 'blue';
  /** Current score position (0–121). */
  frontPeg: number;
  /** Previous score position, trails frontPeg. */
  backPeg: number;
}
