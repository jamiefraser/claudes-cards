/**
 * LandingPage — sign-in via dev token (pick username from dropdown).
 * Redirects to /lobby if already authenticated.
 * SPEC.md §6, §8
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/useAuth';
import en from '@/i18n/en.json';
import { logger } from '@/utils/logger';

/** Test users seeded in dev — SPEC.md §8 */
const TEST_USERS = [
  { username: 'test-player-1',   displayName: 'TestPlayer1' },
  { username: 'test-player-2',   displayName: 'TestPlayer2' },
  { username: 'test-player-3',   displayName: 'TestPlayer3' },
  { username: 'test-moderator',  displayName: 'TestMod' },
  { username: 'test-admin',      displayName: 'TestAdmin' },
];

export function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, login } = useAuth();
  const [selectedUser, setSelectedUser] = useState(TEST_USERS[0].username);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect when already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/lobby', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSigningIn(true);
    try {
      logger.debug('LandingPage: logging in', { username: selectedUser });
      await login(selectedUser);
      navigate('/lobby', { replace: true });
    } catch (err) {
      logger.warn('LandingPage: login error', { err });
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
    <main className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm bg-slate-800 rounded-xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white text-center mb-2">
          {en.app.title}
        </h1>
        <p className="text-slate-400 text-sm text-center mb-6">
          {en.auth.devModeNotice}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">{en.auth.selectUser}</span>
            <select
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-white rounded-md px-3 py-2 text-sm"
              aria-label={en.auth.selectUser}
              disabled={signingIn}
            >
              {TEST_USERS.map(u => (
                <option key={u.username} value={u.username}>
                  {u.displayName} ({u.username})
                </option>
              ))}
            </select>
          </label>

          {error && (
            <p role="alert" className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={signingIn}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-md transition-colors disabled:opacity-50"
          >
            {signingIn ? en.auth.signingIn : en.auth.signIn}
          </button>
        </form>
      </div>
    </main>
  );
}
