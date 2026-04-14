import { AnimationEngine } from '../src/AnimationEngine';

describe('AnimationEngine', () => {
  let engine: AnimationEngine;

  beforeEach(() => {
    engine = new AnimationEngine();
  });

  it('dealCard returns an event with type "deal"', () => {
    const event = engine.dealCard('card-1', 0, 0);
    expect(event.type).toBe('deal');
    expect(event.cardId).toBe('card-1');
  });

  it('dealCard event has a reasonable duration (> 0 ms)', () => {
    const event = engine.dealCard('card-1', 1, 0);
    expect(event.duration).toBeGreaterThan(0);
  });

  it('flipCard returns an event with type "flip"', () => {
    const event = engine.flipCard('card-2');
    expect(event.type).toBe('flip');
    expect(event.cardId).toBe('card-2');
  });

  it('moveToDiscard returns an event with type "discard"', () => {
    const event = engine.moveToDiscard('card-3');
    expect(event.type).toBe('discard');
    expect(event.cardId).toBe('card-3');
  });

  it('drawFromPile returns an event with type "draw"', () => {
    const event = engine.drawFromPile('card-4', 2);
    expect(event.type).toBe('draw');
    expect(event.cardId).toBe('card-4');
  });

  it('shuffleDeck returns an event with type "shuffle"', () => {
    const event = engine.shuffleDeck();
    expect(event.type).toBe('shuffle');
  });

  it('all events have a soundHook property', () => {
    const events = [
      engine.dealCard('c1', 0, 0),
      engine.flipCard('c2'),
      engine.moveToDiscard('c3'),
      engine.drawFromPile('c4', 1),
      engine.shuffleDeck(),
    ];
    for (const event of events) {
      expect(event).toHaveProperty('soundHook');
    }
  });

  it('onAnimationComplete callback fires when event completes', (done) => {
    engine.onAnimationComplete((event) => {
      expect(event.type).toBe('flip');
      done();
    });
    const event = engine.flipCard('card-5');
    // Simulate completion
    event.complete();
  });

  it('animation duration values are positive numbers', () => {
    expect(engine.dealCard('c', 0, 0).duration).toBeGreaterThan(0);
    expect(engine.flipCard('c').duration).toBeGreaterThan(0);
    expect(engine.moveToDiscard('c').duration).toBeGreaterThan(0);
    expect(engine.drawFromPile('c', 0).duration).toBeGreaterThan(0);
    expect(engine.shuffleDeck().duration).toBeGreaterThan(0);
  });

  it('supports multiple onAnimationComplete subscribers', () => {
    const calls: string[] = [];
    engine.onAnimationComplete((e) => calls.push('a:' + e.type));
    engine.onAnimationComplete((e) => calls.push('b:' + e.type));
    engine.dealCard('c1', 0, 0).complete();
    expect(calls).toContain('a:deal');
    expect(calls).toContain('b:deal');
  });
});
