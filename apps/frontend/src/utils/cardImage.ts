/**
 * cardImage — maps a Card (front or back) to an SVG asset URL.
 *
 * Artwork lives under `src/img/standard/` and `src/img/phase10/` and is
 * bundled at build time via Vite's `import.meta.glob`.
 *
 * Conventions (from the artwork):
 *   Standard  : `<s><rank>.svg` where s = c/d/h/s, rank = 1..13 (1=Ace, 11=J, 12=Q, 13=K)
 *   Phase 10  : `<C><value>.svg` where C = R/B/G/Y, value = 1..12
 *   Phase 10  : wild.svg, Skip.svg
 *   Backs     : standard/cardback_blue.svg, phase10/back.svg (left half of two-card sheet)
 */
import type { Card } from '@shared/cards';

// Eagerly bundle every card-art SVG so we can look up URLs by file name.
// The glob returns { '/src/img/standard/c1.svg': '/assets/c1-hash.svg', ... }
// where keys are the absolute source paths and values are the emitted URLs.
const standardAssets = import.meta.glob('@/img/standard/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const phase10Assets = import.meta.glob('@/img/phase10/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Resolve a standard-deck filename (e.g. 'c1.svg') → bundled asset URL. */
function standardUrl(filename: string): string | null {
  const match = Object.entries(standardAssets).find(([key]) => key.endsWith('/' + filename));
  return match ? match[1] : null;
}

/** Resolve a phase-10 filename (e.g. 'R5.svg') → bundled asset URL. */
function phase10Url(filename: string): string | null {
  const match = Object.entries(phase10Assets).find(([key]) => key.endsWith('/' + filename));
  return match ? match[1] : null;
}

/** First letter of each suit — matches the art filenames. */
const SUIT_PREFIX: Record<string, string> = {
  hearts: 'h',
  diamonds: 'd',
  clubs: 'c',
  spades: 's',
};

/** First letter of each phase-10 color. */
const COLOR_PREFIX: Record<string, string> = {
  red: 'R',
  blue: 'B',
  green: 'G',
  yellow: 'Y',
};

/**
 * Get the SVG URL for a card face.
 * Returns null if no artwork is found (caller falls back to a placeholder).
 */
export function getCardFaceUrl(card: Card): string | null {
  if (card.deckType === 'phase10') {
    if (card.phase10Type === 'wild') return phase10Url('wild.svg');
    if (card.phase10Type === 'skip') return phase10Url('Skip.svg');
    const prefix = card.phase10Color ? COLOR_PREFIX[card.phase10Color] : null;
    if (!prefix) return null;
    return phase10Url(`${prefix}${card.value}.svg`);
  }
  // Standard deck
  const prefix = card.suit ? SUIT_PREFIX[card.suit] : null;
  if (!prefix) return null;
  return standardUrl(`${prefix}${card.value}.svg`);
}

/** URL for the back of a card — chosen by deck type. */
export function getCardBackUrl(deckType: Card['deckType']): string | null {
  if (deckType === 'phase10') return phase10Url('back.svg');
  return standardUrl('cardback_blue.svg');
}

/**
 * The phase-10 back.svg file contains TWO card-back designs side by side
 * (it's a cover/product sheet). We want to show only the left half.
 * The caller should apply `object-fit: cover; object-position: left;`
 * to the <img>, or wrap in a container with overflow:hidden.
 *
 * This helper returns `true` when the back image needs this crop treatment.
 */
export function backImageNeedsLeftCrop(deckType: Card['deckType']): boolean {
  return deckType === 'phase10';
}

/**
 * Phase-10 wild.svg / Skip.svg contain two designs side-by-side (same
 * product-sheet treatment as back.svg). The face image needs the same
 * left-crop so only a single card shows.
 */
export function faceImageNeedsLeftCrop(card: Card): boolean {
  return (
    card.deckType === 'phase10' &&
    (card.phase10Type === 'wild' || card.phase10Type === 'skip')
  );
}
