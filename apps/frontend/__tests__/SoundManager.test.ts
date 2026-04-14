/**
 * SoundManager tests — SPEC.md §10.2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Howler before importing SoundManager
vi.mock('howler', () => {
  const mockPlay = vi.fn();
  const mockVolume = vi.fn();
  const MockHowl = vi.fn().mockImplementation(() => ({
    play: mockPlay,
    volume: mockVolume,
  }));
  return { Howl: MockHowl };
});

// We need to import after mock is set up
// Dynamic import used to ensure mock is applied
describe('SoundManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('plays a sound when enabled', async () => {
    const { Howl } = await import('howler');
    const mockPlayFn = vi.fn();
    (Howl as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      play: mockPlayFn,
      volume: vi.fn(),
    }));

    // Re-import to get fresh instance
    const { soundManager } = await import('../src/sound/SoundManager');
    soundManager.setEnabled(true);
    soundManager.play('card-deal');
    expect(mockPlayFn).toHaveBeenCalledOnce();
  });

  it('does not play when disabled', async () => {
    const { Howl } = await import('howler');
    const mockPlayFn = vi.fn();
    (Howl as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      play: mockPlayFn,
      volume: vi.fn(),
    }));

    const { soundManager } = await import('../src/sound/SoundManager');
    soundManager.setEnabled(false);
    soundManager.play('card-deal');
    expect(mockPlayFn).not.toHaveBeenCalled();
  });

  it('setVolume clamps to 0-1 range', async () => {
    const mockVolumeFn = vi.fn();
    const { Howl } = await import('howler');
    (Howl as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      play: vi.fn(),
      volume: mockVolumeFn,
    }));

    const { soundManager } = await import('../src/sound/SoundManager');
    // Pre-load a sound so the volume call applies
    soundManager.setEnabled(true);
    soundManager.play('card-flip'); // creates the Howl instance

    soundManager.setVolume(1.5); // should clamp to 1.0
    expect(mockVolumeFn).toHaveBeenCalledWith(1);

    soundManager.setVolume(-0.5); // should clamp to 0.0
    expect(mockVolumeFn).toHaveBeenCalledWith(0);
  });

  it('setEnabled re-enables sound', async () => {
    const { Howl } = await import('howler');
    const mockPlayFn = vi.fn();
    (Howl as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      play: mockPlayFn,
      volume: vi.fn(),
    }));

    const { soundManager } = await import('../src/sound/SoundManager');
    soundManager.setEnabled(false);
    soundManager.play('card-draw');
    expect(mockPlayFn).not.toHaveBeenCalled();

    soundManager.setEnabled(true);
    soundManager.play('card-draw');
    expect(mockPlayFn).toHaveBeenCalledOnce();
  });

  it('supports all 12 sound events', async () => {
    const { Howl } = await import('howler');
    const mockPlayFn = vi.fn();
    (Howl as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      play: mockPlayFn,
      volume: vi.fn(),
    }));

    const { soundManager } = await import('../src/sound/SoundManager');
    soundManager.setEnabled(true);

    const events = [
      'card-deal', 'card-flip', 'card-discard', 'card-draw', 'card-shuffle',
      'phase-complete', 'round-win', 'game-win', 'game-lose',
      'skip-played', 'notification', 'peg-move',
    ] as const;

    for (const event of events) {
      soundManager.play(event);
    }

    expect(mockPlayFn).toHaveBeenCalledTimes(12);
  });
});
