/**
 * LeaderboardPage — game selector, period tabs, scope toggle, renders LeaderboardTable.
 * SPEC.md §6, §18 Epic 7
 */
import React, { useState } from 'react';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import en from '@/i18n/en.json';

type Period = 'monthly' | 'allTime';
type Scope = 'global' | 'friends';

/** Game catalog — all 15 games. SPEC.md §2.2 */
const GAME_CATALOG = [
  { id: 'phase10',    name: 'Phase 10' },
  { id: 'rummy',      name: 'Rummy' },
  { id: 'ginrummy',   name: 'Gin Rummy' },
  { id: 'canasta',    name: 'Canasta' },
  { id: 'cribbage',   name: 'Cribbage' },
  { id: 'spades',     name: 'Spades' },
  { id: 'hearts',     name: 'Hearts' },
  { id: 'euchre',     name: 'Euchre' },
  { id: 'whist',      name: 'Whist' },
  { id: 'ohhell',     name: 'Oh Hell!' },
  { id: 'gofish',     name: 'Go Fish' },
  { id: 'crazyeights', name: 'Crazy Eights' },
  { id: 'war',        name: 'War' },
  { id: 'spit',       name: 'Spit / Speed' },
  { id: 'idiot',      name: 'Idiot / Shithead' },
] as const;

export function LeaderboardPage() {
  const [selectedGameId, setSelectedGameId] = useState<string>(GAME_CATALOG[0].id);
  const [period, setPeriod] = useState<Period>('monthly');
  const [scope, setScope] = useState<Scope>('global');

  return (
    <main className="min-h-screen bg-slate-900 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">{en.leaderboard.title}</h1>

        {/* Game selector */}
        <div className="mb-6">
          <label htmlFor="game-select" className="block text-sm font-medium text-slate-400 mb-1">
            {en.lobby.filterGame}
          </label>
          <select
            id="game-select"
            data-testid="game-switcher"
            value={selectedGameId}
            onChange={e => setSelectedGameId(e.target.value)}
            className="bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {GAME_CATALOG.map(game => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>
        </div>

        {/* Period toggle — plain button group to avoid tablist collision with game switcher tests */}
        <div
          role="group"
          aria-label="Period"
          className="flex gap-1 mb-4 bg-slate-800 p-1 rounded-lg w-fit"
        >
          {(['monthly', 'allTime'] as const).map(p => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {p === 'monthly' ? en.leaderboard.monthly : en.leaderboard.allTime}
            </button>
          ))}
        </div>

        {/* Scope toggle */}
        <div
          role="group"
          aria-label="Scope"
          className="flex gap-2 mb-6"
        >
          {(['global', 'friends'] as const).map(s => (
            <button
              key={s}
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                scope === s
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-transparent border-slate-600 text-slate-400 hover:border-slate-400'
              }`}
            >
              {s === 'global' ? en.leaderboard.global : en.leaderboard.friends}
            </button>
          ))}
        </div>

        {/* Leaderboard table */}
        <div className="bg-slate-800 rounded-xl p-6">
          <LeaderboardTable
            gameId={selectedGameId}
            period={period}
            scope={scope}
          />
        </div>
      </div>
    </main>
  );
}
