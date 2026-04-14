/**
 * NotFoundPage — 404 page.
 * SPEC.md §6
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import en from '@/i18n/en.json';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-4">
      <h1 className="text-6xl font-bold text-indigo-500 mb-4">404</h1>
      <h2 className="text-2xl text-white mb-2">{en.app.notFound}</h2>
      <p className="text-slate-400 mb-8">{en.app.notFoundMessage}</p>
      <button
        onClick={() => navigate('/lobby')}
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-2.5 rounded-md transition-colors"
      >
        {en.app.backToLobby}
      </button>
    </main>
  );
}
