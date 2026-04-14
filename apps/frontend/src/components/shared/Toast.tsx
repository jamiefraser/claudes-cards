/**
 * Toast — lightweight notification component.
 * Usage: render <ToastContainer> once in App.tsx, then call the toast() helper.
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import en from '@/i18n/en.json';

type ToastVariant = 'info' | 'success' | 'warn' | 'error';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info:    'bg-slate-700 text-white',
  success: 'bg-green-700 text-white',
  warn:    'bg-amber-600 text-white',
  error:   'bg-red-700 text-white',
};

const AUTO_DISMISS_MS = 4000;

let _toastIdCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = String(++_toastIdCounter);
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            className={`px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-3 min-w-[220px] max-w-[360px] ${VARIANT_CLASSES[t.variant]}`}
          >
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label={en.aria.dismissNotification}
              className="text-white/70 hover:text-white text-lg leading-none"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
