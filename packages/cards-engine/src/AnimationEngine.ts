/**
 * Represents a single animation event for a card movement.
 */
export interface AnimationEvent {
  /** Type of animation */
  type: 'deal' | 'flip' | 'discard' | 'draw' | 'shuffle';
  /** ID of the card being animated (undefined for shuffle) */
  cardId?: string;
  /** Duration of the animation in milliseconds */
  duration: number;
  /** Hook for triggering a sound effect at the right moment */
  soundHook: string;
  /** Call this when the animation completes to notify subscribers */
  complete: () => void;
}

type AnimationCompleteCallback = (event: AnimationEvent) => void;

/**
 * Controls card animation events. Emits AnimationEvent objects that
 * the frontend uses to drive CSS animations and play sounds.
 */
export class AnimationEngine {
  private subscribers: AnimationCompleteCallback[] = [];

  /**
   * Registers a callback to be invoked when any animation completes.
   */
  onAnimationComplete(callback: AnimationCompleteCallback): void {
    this.subscribers.push(callback);
  }

  private notify(event: AnimationEvent): void {
    for (const cb of this.subscribers) {
      cb(event);
    }
  }

  private makeEvent(
    type: AnimationEvent['type'],
    cardId: string | undefined,
    duration: number,
    soundHook: string
  ): AnimationEvent {
    const event: AnimationEvent = {
      type,
      cardId,
      duration,
      soundHook,
      complete: () => this.notify(event),
    };
    return event;
  }

  /**
   * Creates a deal animation event — card moves from deck to a seat.
   * @param cardId The card being dealt
   * @param targetSeatIndex The seat index receiving the card
   * @param delayMs Additional stagger delay in ms
   */
  dealCard(cardId: string, targetSeatIndex: number, delayMs: number): AnimationEvent {
    // Base deal duration + stagger per seat
    const duration = 300 + targetSeatIndex * 50 + delayMs;
    return this.makeEvent('deal', cardId, duration, 'card-deal');
  }

  /**
   * Creates a flip animation event — card turns face-up or face-down.
   */
  flipCard(cardId: string): AnimationEvent {
    return this.makeEvent('flip', cardId, 200, 'card-flip');
  }

  /**
   * Creates a discard animation event — card moves to the discard pile.
   */
  moveToDiscard(cardId: string): AnimationEvent {
    return this.makeEvent('discard', cardId, 250, 'card-place');
  }

  /**
   * Creates a draw animation event — card moves from pile to a seat.
   * @param cardId The card being drawn
   * @param targetSeatIndex The seat index drawing the card
   */
  drawFromPile(cardId: string, targetSeatIndex: number): AnimationEvent {
    const duration = 300 + targetSeatIndex * 30;
    return this.makeEvent('draw', cardId, duration, 'card-draw');
  }

  /**
   * Creates a shuffle animation event — deck is shuffled.
   */
  shuffleDeck(): AnimationEvent {
    return this.makeEvent('shuffle', undefined, 800, 'card-shuffle');
  }
}
