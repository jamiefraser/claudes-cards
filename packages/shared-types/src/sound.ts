/**
 * Sound types for the platform.
 * SPEC.md §11.5 and §10.
 */

/**
 * All sound events that SoundManager can play.
 * Matches the catalogue in SPEC.md §10 exactly.
 */
export type SoundEvent =
  | 'card-deal'
  | 'card-flip'
  | 'card-discard'
  | 'card-draw'
  | 'card-shuffle'
  | 'phase-complete'
  | 'round-win'
  | 'game-win'
  | 'game-lose'
  | 'skip-played'
  | 'notification'
  | 'peg-move';

/**
 * Attribution record for a sound asset, used on the /credits page.
 * Tracks provenance for CC BY and CC0 assets.
 */
export interface SoundCredit {
  file: string;
  description: string;
  creator: string;
  sourceUrl: string;
  license: string;
}
