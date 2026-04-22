/**
 * ThemePicker — two flavours.
 *
 *   <ThemePicker variant="pill" />   A header-sized segmented control.
 *   <ThemePicker variant="cards" />  The full 3-panel chooser for Settings.
 *
 * Both are controlled internally by the useTheme hook. No props required.
 *
 * The segmented pill uses a `<fieldset>` + `<input type="radio">` pattern
 * so keyboard nav works out of the box (arrows cycle, Enter/Space select).
 */
import React from 'react';
import { useTheme, THEMES, type ThemeDescriptor } from '@/hooks/useTheme';

export interface ThemePickerProps {
  variant?: 'pill' | 'cards';
  /** Optional label — hidden in pill, rendered as heading in cards. */
  label?: string;
}

function Swatches({ theme }: { theme: ThemeDescriptor }) {
  return (
    <div className="flex gap-0.5" aria-hidden>
      {theme.swatches.map((hex) => (
        <span
          key={hex}
          className="w-2.5 h-2.5 rounded-full ring-1 ring-hairline/50"
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  );
}

export function ThemePicker({ variant = 'pill', label = 'Theme' }: ThemePickerProps) {
  const { theme, setTheme } = useTheme();

  if (variant === 'pill') {
    return (
      <fieldset
        className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-paper-raised/70 border border-hairline/60"
        aria-label={label}
      >
        <legend className="sr-only">{label}</legend>
        {THEMES.map((t) => {
          const selected = t.id === theme;
          return (
            <label
              key={t.id}
              className={[
                'inline-flex items-center gap-1.5 cursor-pointer',
                'min-h-[36px] px-2.5 rounded-full text-xs font-medium',
                'transition-[background-color,color,border-color] duration-180',
                'focus-within:ring-2 focus-within:ring-ochre-hi focus-within:ring-offset-1 focus-within:ring-offset-paper',
                selected
                  ? 'bg-paper text-ink shadow-paper'
                  : 'text-ink-soft hover:bg-paper/60',
              ].join(' ')}
            >
              <input
                type="radio"
                name="theme-picker-pill"
                value={t.id}
                checked={selected}
                onChange={() => setTheme(t.id)}
                className="sr-only"
              />
              <Swatches theme={t} />
              <span className="whitespace-nowrap">{t.label}</span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  // variant === 'cards'
  return (
    <fieldset className="flex flex-col gap-3" aria-label={label}>
      <legend className="font-display text-sm font-semibold text-ochre uppercase tracking-[0.18em] mb-1">
        {label}
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {THEMES.map((t) => {
          const selected = t.id === theme;
          return (
            <label
              key={t.id}
              className={[
                'group relative flex flex-col gap-2 p-4 rounded-lg cursor-pointer',
                'border transition-[background-color,border-color,box-shadow] duration-180',
                'focus-within:ring-2 focus-within:ring-ochre-hi focus-within:ring-offset-2 focus-within:ring-offset-paper',
                selected
                  ? 'border-ochre bg-paper-raised shadow-paper'
                  : 'border-hairline/60 bg-paper-raised/40 hover:border-ochre/60',
              ].join(' ')}
            >
              <input
                type="radio"
                name="theme-picker-cards"
                value={t.id}
                checked={selected}
                onChange={() => setTheme(t.id)}
                className="sr-only"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-lg text-ink leading-tight">{t.label}</span>
                <Swatches theme={t} />
              </div>
              <p className="text-xs text-whisper">{t.tagline}</p>
              <span
                aria-hidden
                className={[
                  'absolute top-3 right-3 w-4 h-4 rounded-full border-2',
                  selected
                    ? 'border-ochre bg-ochre'
                    : 'border-hairline/70 bg-paper',
                ].join(' ')}
              />
              {selected && (
                <span className="sr-only">Currently selected</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
