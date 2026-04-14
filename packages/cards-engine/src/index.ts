/**
 * @card-platform/cards-engine — barrel export
 */

export { Hand } from './Hand';
export { Pile } from './Pile';
export { AnimationEngine } from './AnimationEngine';
export type { AnimationEvent } from './AnimationEngine';

export {
  createStandardCard,
  createPhase10NumberCard,
  createPhase10WildCard,
  createPhase10SkipCard,
} from './Card';
export type { CardWithMeta } from './Card';

export { createStandardDeck } from './deckTypes/standard';
export type { StandardDeck } from './deckTypes/standard';

export { createPhase10Deck } from './deckTypes/phase10';
export type { Phase10Deck } from './deckTypes/phase10';

export { getSvgPath, getCardBack } from './renderers/svgRenderer';
