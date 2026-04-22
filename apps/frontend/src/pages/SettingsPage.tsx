/**
 * SettingsPage — user-facing preferences.
 * SPEC.md §6
 *
 * Today this hosts the theme picker. Other preferences (sound, motion,
 * default async timer) can mount here as they land.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemePicker } from '@/components/shared/ThemePicker';
import en from '@/i18n/en.json';

export function SettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <header className="sticky top-0 z-raised bg-paper/92 backdrop-blur border-b border-hairline/70">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 min-h-[44px] px-3 text-sm text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi rounded-md"
            aria-label="Back"
          >
            <span aria-hidden>←</span>
            <span>Back</span>
          </button>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-ink">
            {en.settings.title}
          </h1>
          <div className="w-16" aria-hidden />
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col gap-8">
        <section aria-labelledby="appearance-heading" className="flex flex-col gap-4">
          <div>
            <h2
              id="appearance-heading"
              className="font-display text-lg sm:text-xl font-semibold text-ink"
            >
              Appearance
            </h2>
            <p className="text-sm text-whisper mt-1">
              Pick the aesthetic that suits the room you&rsquo;re playing in. The choice is
              remembered on this device.
            </p>
          </div>

          <div aria-hidden className="h-px bg-hairline/70" />

          <ThemePicker variant="cards" label="Theme" />
        </section>
      </main>
    </div>
  );
}
