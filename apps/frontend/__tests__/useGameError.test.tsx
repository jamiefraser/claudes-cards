/**
 * useGameError — unit tests.
 *
 * Verifies that the hook:
 *  - subscribes to `game_error` on the game socket
 *  - forwards the payload message to useToast() as 'error'
 *  - falls back to the i18n generic error when message is missing
 *  - logs via logger.warn (CLAUDE.md rule 7 — no console.log)
 *  - cleans up the listener on unmount
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';

// ---- Mocks (hoisted) -----------------------------------------------------

const { handlers, fakeSocket, fire, mockToast, mockLoggerWarn } = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const handlers = new Map<string, Set<Handler>>();
  const fakeSocket = {
    on: (event: string, handler: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off: (event: string, handler: Handler) => {
      handlers.get(event)?.delete(handler);
    },
    emit: vi.fn(),
  };
  function fire(event: string, payload: unknown) {
    handlers.get(event)?.forEach((h) => h(payload));
  }
  const mockToast = vi.fn();
  const mockLoggerWarn = vi.fn();
  return { handlers, fakeSocket, fire, mockToast, mockLoggerWarn };
});

vi.mock('@/hooks/useSocket', () => ({
  getGameSocket: () => fakeSocket,
}));

vi.mock('@/components/shared/Toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: vi.fn(),
  },
}));

// Import after mocks.
import { useGameError } from '@/hooks/useGameError';

beforeEach(() => {
  handlers.clear();
  mockToast.mockClear();
  mockLoggerWarn.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('useGameError', () => {
  it('subscribes to game_error on the game socket', () => {
    renderHook(() => useGameError('room-1'));
    expect(handlers.has('game_error')).toBe(true);
    expect(handlers.get('game_error')!.size).toBe(1);
  });

  it('calls toast with the error message and variant "error"', () => {
    renderHook(() => useGameError('room-1'));
    act(() => {
      fire('game_error', { code: 'INVALID_MELD', message: 'Your meld is invalid.' });
    });
    expect(mockToast).toHaveBeenCalledWith('Your meld is invalid.', 'error');
  });

  it('falls back to generic error string when payload.message is falsy', () => {
    renderHook(() => useGameError('room-1'));
    act(() => {
      fire('game_error', { code: 'UNKNOWN' });
    });
    // Should use en.error.generic
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining('error occurred'),
      'error',
    );
  });

  it('logs each error via logger.warn keyed by code', () => {
    renderHook(() => useGameError('room-1'));
    act(() => {
      fire('game_error', { code: 'INITIAL_MELD_LOW', message: 'Initial meld too low.' });
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('game_error'),
      expect.objectContaining({ code: 'INITIAL_MELD_LOW' }),
    );
  });

  it('cleans up the listener on unmount', () => {
    const { unmount } = renderHook(() => useGameError('room-1'));
    expect(handlers.get('game_error')!.size).toBe(1);
    unmount();
    expect(handlers.get('game_error')!.size).toBe(0);
  });

  it('does not subscribe when roomId is null', () => {
    renderHook(() => useGameError(null));
    expect(handlers.has('game_error')).toBe(false);
  });
});
