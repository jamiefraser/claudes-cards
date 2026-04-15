/**
 * LandingPage — public marketing page.
 *
 * - Authenticated users are redirected to /lobby.
 * - Unauthenticated users see an ad for the platform with a sign-in CTA.
 * - In production (MSAL): the CTA kicks off a B2C redirect login.
 * - In dev (DevAuthProvider): the CTA opens an inline test-user picker.
 *
 * SPEC.md §6
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import en from '@/i18n/en.json';
import { logger } from '@/utils/logger';

const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE as string | undefined) ?? 'dev';

const GAMES: { key: keyof typeof en.rules.games; emoji: string }[] = [
  { key: 'cribbage', emoji: '♠' },
  { key: 'ginrummy', emoji: '♥' },
  { key: 'phase10', emoji: '⑩' },
  { key: 'spades', emoji: '♠' },
  { key: 'hearts', emoji: '♥' },
  { key: 'euchre', emoji: '♦' },
  { key: 'canasta', emoji: '♣' },
  { key: 'rummy', emoji: '♦' },
  { key: 'crazyeights', emoji: '8' },
  { key: 'ohhell', emoji: '♣' },
  { key: 'whist', emoji: '♠' },
  { key: 'gofish', emoji: '🐟' },
  { key: 'war', emoji: '⚔' },
  { key: 'spit', emoji: '⚡' },
  { key: 'idiot', emoji: '🤦' },
];

const BENEFIT_KEYS = ['realtime', 'friends', 'cross', 'fair', 'leaders', 'sound'] as const;

const TEST_USERS = [
  { username: 'test-player-1',  displayName: 'TestPlayer1' },
  { username: 'test-player-2',  displayName: 'TestPlayer2' },
  { username: 'test-player-3',  displayName: 'TestPlayer3' },
  { username: 'test-moderator', displayName: 'TestMod' },
  { username: 'test-admin',     displayName: 'TestAdmin' },
];

export function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, login } = useAuth();

  const [showDevPicker, setShowDevPicker] = useState(false);
  const [selectedUser, setSelectedUser] = useState(TEST_USERS[0]!.username);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) navigate('/lobby', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleSignIn = async () => {
    setError(null);
    if (AUTH_MODE === 'dev') {
      setShowDevPicker(true);
      return;
    }
    setSigningIn(true);
    try {
      logger.debug('LandingPage: starting MSAL login');
      await login();
    } catch (err) {
      logger.warn('LandingPage: MSAL login error', { err });
      setError(en.auth.authError);
      setSigningIn(false);
    }
  };

  const handleDevSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSigningIn(true);
    try {
      await login(selectedUser);
      navigate('/lobby', { replace: true });
    } catch (err) {
      logger.warn('LandingPage: dev login error', { err });
      setError(en.auth.authError);
    } finally {
      setSigningIn(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <p className="text-slate-400">{en.app.loading}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900 text-slate-100">
      {/* Top bar */}
      <header className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>🂡</span>
          <span className="font-semibold tracking-wide">{en.app.title}</span>
        </div>
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="text-sm text-slate-300 hover:text-white underline-offset-4 hover:underline disabled:opacity-50"
        >
          {en.landing.ctaSecondary}
        </button>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 sm:pt-20 pb-12 text-center">
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight bg-gradient-to-r from-indigo-300 via-sky-200 to-emerald-200 bg-clip-text text-transparent">
          {en.landing.hero}
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto">
          {en.landing.subhero}
        </p>

        <div className="mt-10 flex flex-col items-center gap-3">
          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-base px-8 py-3 rounded-full shadow-lg shadow-indigo-900/40 transition-colors"
          >
            {signingIn ? en.auth.signingIn : en.landing.ctaPrimary}
          </button>
          <p className="text-xs text-slate-400 max-w-sm">{en.landing.loginNotice}</p>
          {error && (
            <p role="alert" className="text-sm text-red-400">{error}</p>
          )}
        </div>
      </section>

      {/* Dev picker (only in dev mode) */}
      {showDevPicker && AUTH_MODE === 'dev' && (
        <section className="max-w-md mx-auto px-4 pb-12">
          <form
            onSubmit={handleDevSubmit}
            className="bg-slate-800/70 backdrop-blur border border-slate-700 rounded-xl p-6 shadow-xl"
          >
            <p className="text-sm text-slate-300 mb-3">{en.auth.devModeNotice}</p>
            <label className="flex flex-col gap-1 mb-4">
              <span className="text-xs uppercase tracking-wider text-slate-400">
                {en.auth.selectUser}
              </span>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="bg-slate-900 border border-slate-600 text-white rounded-md px-3 py-2 text-sm"
                aria-label={en.auth.selectUser}
                disabled={signingIn}
              >
                {TEST_USERS.map((u) => (
                  <option key={u.username} value={u.username}>
                    {u.displayName} ({u.username})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={signingIn}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-md transition-colors disabled:opacity-50"
            >
              {signingIn ? en.auth.signingIn : en.auth.signIn}
            </button>
          </form>
        </section>
      )}

      {/* Games */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-semibold text-center mb-8">
          {en.landing.gamesHeading}
        </h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {GAMES.map(({ key, emoji }) => {
            const game = en.rules.games[key];
            return (
              <li
                key={key}
                className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 hover:border-indigo-500/60 transition-colors"
              >
                <div className="text-2xl mb-2" aria-hidden>{emoji}</div>
                <div className="font-semibold text-white text-sm">{game.title}</div>
                <div className="text-xs text-slate-400 mt-1 leading-snug">
                  {game.subtitle}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Benefits */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-semibold text-center mb-10">
          {en.landing.benefitsHeading}
        </h2>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {BENEFIT_KEYS.map((key) => {
            const b = en.landing.benefits[key];
            return (
              <li
                key={key}
                className="bg-slate-800/60 border border-slate-700 rounded-xl p-5"
              >
                <h3 className="font-semibold text-white">{b.title}</h3>
                <p className="text-sm text-slate-300 mt-2 leading-relaxed">{b.body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Secondary CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-base px-8 py-3 rounded-full shadow-lg shadow-indigo-900/40 transition-colors disabled:opacity-50"
        >
          {signingIn ? en.auth.signingIn : en.landing.ctaPrimary}
        </button>
      </section>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-center text-xs text-slate-500">
        <button
          onClick={() => navigate('/credits')}
          className="hover:text-slate-300 underline-offset-4 hover:underline"
        >
          Credits & attribution
        </button>
      </footer>
    </main>
  );
}
