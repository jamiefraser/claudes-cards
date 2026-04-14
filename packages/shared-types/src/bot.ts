/**
 * Bot system types
 * Defined in SPEC.md §11.1 and §9.3
 */
import type { GameState } from './gameState.js';
import type { PlayerAction } from './gameState.js';

/**
 * Describes a bot currently occupying a human player's seat.
 * Used in gameStore.activeBots[] and in bot_activated socket payloads.
 */
export interface BotSeatInfo {
  /** The original human player's ID */
  playerId: string;
  displayName: string;
  seatIndex: number;
  /** ISO 8601 timestamp when the bot was activated */
  activatedAt: string;
}

/**
 * Payload for the bot_activated socket event (Server → Client, /game namespace).
 */
export interface BotActivatedPayload {
  /** The playerId of the seat the bot took */
  playerId: string;
  seatIndex: number;
}

/**
 * Payload for the bot_yielded socket event (Server → Client, /game namespace).
 * Sent when a human reclaims their seat from a bot.
 */
export interface BotYieldedPayload {
  /** The playerId of the seat the human reclaimed */
  playerId: string;
  seatIndex: number;
}

/**
 * The bot activation policy — all fields are constant per SPEC.md §9.3.
 */
export interface BotActivationPolicy {
  /** Always true — bots activate when async timer expires */
  activateOnTimerExpiry: true;
  /** Seats that bots may fill */
  eligibleSeats: 'any-disconnected-human-seat';
  /** Human reclaim — always true */
  humanCanReclaimAtAnyTime: true;
  /** Leaderboard — bots never affect leaderboards */
  botResultsExcludedFromLeaderboard: true;
  /** Chat — bots never send chat messages */
  botsAreSilent: true;
  /** Identification — always visible in UI */
  botLabelVisibleToAllParticipants: true;
  /** Think time minimum (ms) — randomised per action */
  thinkTimeMin: 800;
  /** Think time maximum (ms) — randomised per action */
  thinkTimeMax: 2500;
}

/**
 * Interface that every bot strategy must implement.
 * Defined in SPEC.md §9.4.
 * Each game engine supporting asyncMode must have a corresponding IBotStrategy in
 * socket-service/src/bots/strategies/.
 */
export interface IBotStrategy {
  readonly gameId: string;

  /**
   * Given the current game state and the bot's playerId,
   * return the action the bot should take on its turn.
   * Strategy must return a valid PlayerAction — invalid actions
   * are not retried; they throw and activate the fallback.
   */
  chooseAction(state: GameState, botPlayerId: string): PlayerAction;

  /**
   * Fallback: if chooseAction throws or returns invalid,
   * the bot draws and discards the highest-point card it can legally discard.
   * This method MUST never throw.
   */
  fallbackAction(state: GameState, botPlayerId: string): PlayerAction;
}
