/**
 * ConfirmDialog — Le Salon-themed modal for destructive confirmations.
 *
 * Replaces native `window.confirm` for actions like "End game" so the
 * dialog matches the theme, respects reduced-motion, supports Esc /
 * backdrop-dismiss, and traps focus properly.
 *
 * Keep lean: one title, one message, two actions. If a caller needs more
 * (a form, extra fields, a destructive + primary + secondary triple),
 * that's a different component.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly message: string | React.ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /**
   * When `destructive`, the confirm button renders in burgundy (Le Salon
   * destructive tone) and the cancel button is the "stay safe" default
   * that captures initial focus.
   */
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(open, cancelRef);

  // Esc + backdrop-click dismiss. Esc is global; the backdrop listener
  // lives on the backdrop itself below.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop — click to cancel. */}
      <div
        className="absolute inset-0 bg-[rgb(29_24_18_/_0.55)] backdrop-blur-sm animate-seat-in"
        onClick={onCancel}
        aria-hidden
      />
      <div
        ref={trapRef}
        className="relative w-full max-w-md bg-paper-raised border border-hairline/70 rounded-2xl shadow-float p-5 sm:p-6 animate-seat-in overscroll-contain"
      >
        <h2
          id="confirm-dialog-title"
          className="font-display text-xl sm:text-2xl text-ink text-balance mb-2"
        >
          {title}
        </h2>
        <div
          id="confirm-dialog-message"
          className="text-sm text-ink-soft mb-5 leading-relaxed"
        >
          {message}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className={[
              'min-h-[44px] px-5 rounded-full',
              'text-sm font-medium',
              'bg-paper border border-hairline text-ink',
              'hover:border-ochre hover:bg-paper-raised transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper-raised',
            ].join(' ')}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              'min-h-[44px] px-5 rounded-full',
              'text-sm font-semibold',
              'transition-[background-color,border-color,filter]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi focus-visible:ring-offset-2 focus-visible:ring-offset-paper-raised',
              destructive
                ? 'bg-burgundy text-paper border border-burgundy/70 hover:brightness-110'
                : 'bg-ochre text-accent-fg border border-ochre hover:bg-ochre-hi',
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
