/**
 * useFocusTrap — trap Tab focus inside a modal + restore on close.
 *
 * Usage:
 *   const ref = useFocusTrap(isOpen);
 *   return <div ref={ref}>…</div>;
 *
 * On mount (when `active` is true):
 *   • captures the currently-focused element as the "return" target
 *   • focuses the first focusable descendant (or a given initial-focus ref)
 *   • Tab / Shift+Tab cycles within the container
 * On unmount / when `active` flips false:
 *   • restores focus to the captured "return" target
 *
 * WAI-ARIA: dialogs should trap focus. The Phase 10 score modal and the
 * end-game confirm both need it.
 */
import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  initialFocusRef?: React.RefObject<HTMLElement>,
): React.RefObject<T> {
  const containerRef = useRef<T>(null);
  const returnToRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    returnToRef.current = document.activeElement as HTMLElement | null;

    // Autofocus the given initial element, or the first focusable.
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === container,
      );
    const target = initialFocusRef?.current ?? focusables()[0] ?? container;
    target.focus?.();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        container.focus?.();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (current === last || !container.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Return focus to whoever had it before the modal opened.
      returnToRef.current?.focus?.();
    };
    // `initialFocusRef` is optional and its .current changes after mount;
    // depending on its .current would re-trigger the effect pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return containerRef;
}
