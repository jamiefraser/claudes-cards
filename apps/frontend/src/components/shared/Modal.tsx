/**
 * Modal — accessible dialog wrapper.
 * Uses a portal to render on top of other content.
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import en from '@/i18n/en.json';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Additional classes for the modal panel */
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className = '' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Focus trap: store previously focused element, move focus into modal on open, restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      if (panelRef.current) {
        panelRef.current.focus();
      }
    } else {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative z-10 bg-slate-800 rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-sm sm:max-w-md mx-3 sm:mx-4 max-h-[90vh] overflow-y-auto outline-none ${className}`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="modal-title" className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            aria-label={en.aria.closeDialog}
            className="text-slate-400 hover:text-white transition-colors text-2xl leading-none min-w-[44px] min-h-[44px] inline-flex items-center justify-center -mr-2"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
