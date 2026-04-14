/**
 * SettingsPage — placeholder.
 * SPEC.md §6
 */
import React from 'react';
import en from '@/i18n/en.json';

export function SettingsPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-4">
      <h1 className="text-2xl font-bold text-white mb-2">{en.settings.title}</h1>
      <p className="text-slate-400">{en.app.loading}</p>
    </main>
  );
}
