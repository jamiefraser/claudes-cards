/**
 * WinCelebration — fireworks + balloons + streamers overlay for end-of-hand.
 *
 * Pure CSS animation — no extra dependencies. The overlay sits above the
 * table felt (z-40) and wraps the rankings list so the generic end-of-hand
 * information is still reachable.
 *
 * Figma palette check: brass/parchment/brand-secondary/rose are already the
 * table redesign tokens; confetti colors reuse those.
 */
import React, { useMemo } from 'react';
import type { PlayerState } from '@card-platform/shared-types';
import en from '@/i18n/en.json';

export interface WinCelebrationProps {
  readonly ranked: readonly PlayerState[];
  readonly selfPlayerId?: string;
}

const CONFETTI_COUNT = 64;
const BALLOON_COUNT = 8;
const STREAMER_COUNT = 10;

// Deterministic pseudo-random so the animation doesn't "jump" on re-renders.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const CONFETTI_COLORS = [
  '#e8c98a', // brass-bright
  '#c8a96a', // brass
  '#0ea5e9', // brand-secondary
  '#4f46e5', // brand-primary
  '#f5ecd9', // parchment
  '#fb7185', // rose-400
  '#22c55e', // emerald
  '#f97316', // orange
];

const BALLOON_COLORS = [
  '#e8c98a',
  '#0ea5e9',
  '#fb7185',
  '#4f46e5',
  '#22c55e',
  '#f97316',
  '#c8a96a',
  '#e879f9', // fuchsia-400
];

export function WinCelebration({ ranked, selfPlayerId }: WinCelebrationProps) {
  const winner = ranked[0];
  const isSelfWinner = !!winner && winner.playerId === selfPlayerId;

  // Stable random layout per mount
  const rng = useMemo(() => seeded(Date.now() & 0xffff), []);
  const confetti = useMemo(() => {
    const rand = rng;
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      left: rand() * 100,
      delay: rand() * 1.8,
      duration: 3 + rand() * 2.5,
      drift: (rand() - 0.5) * 220,
      rotate: rand() * 720 - 360,
      size: 6 + Math.floor(rand() * 8),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rounded: rand() > 0.5,
    }));
  }, [rng]);

  const balloons = useMemo(() => {
    const rand = rng;
    return Array.from({ length: BALLOON_COUNT }, (_, i) => ({
      id: i,
      left: 4 + (i * 92) / (BALLOON_COUNT - 1) + (rand() - 0.5) * 4,
      delay: rand() * 1.4,
      duration: 7 + rand() * 3,
      sway: 14 + rand() * 12,
      size: 54 + Math.floor(rand() * 22),
      color: BALLOON_COLORS[i % BALLOON_COLORS.length],
    }));
  }, [rng]);

  const streamers = useMemo(() => {
    const rand = rng;
    return Array.from({ length: STREAMER_COUNT }, (_, i) => ({
      id: i,
      left: (i * 100) / (STREAMER_COUNT - 1),
      delay: rand() * 0.8,
      duration: 1.6 + rand() * 1.2,
      hue: CONFETTI_COLORS[(i + 2) % CONFETTI_COLORS.length],
      rotate: (rand() - 0.5) * 30,
      length: 120 + rand() * 110,
    }));
  }, [rng]);

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={en.gameOver.title}
      className="absolute inset-0 z-40 overflow-hidden"
    >
      {/* Translucent backdrop */}
      <div className="absolute inset-0 bg-night/75 backdrop-blur-sm" />

      {/* Scoped keyframes so we can use randomised inline delays/durations */}
      <style>{`
        @keyframes wc-fall {
          0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 0; }
          8%   { opacity: 1; }
          100% { transform: translate3d(var(--wc-drift,0px), 110vh, 0) rotate(var(--wc-rot,360deg)); opacity: 0.9; }
        }
        @keyframes wc-rise {
          0%   { transform: translate3d(0, 110vh, 0); opacity: 0; }
          10%  { opacity: 1; }
          100% { transform: translate3d(0, -20vh, 0); opacity: 0.9; }
        }
        @keyframes wc-sway {
          0%, 100% { transform: translateX(calc(-1 * var(--wc-sway, 10px))); }
          50%      { transform: translateX(var(--wc-sway, 10px)); }
        }
        @keyframes wc-unfurl {
          0%   { transform: scaleY(0); opacity: 0; }
          20%  { opacity: 1; }
          100% { transform: scaleY(1); opacity: 0.85; }
        }
        @keyframes wc-pop {
          0%   { transform: scale(0.4) translateY(-20px); opacity: 0; filter: blur(6px); }
          55%  { transform: scale(1.08) translateY(0); opacity: 1; filter: blur(0); }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes wc-shimmer {
          0%, 100% { filter: brightness(1); }
          50%      { filter: brightness(1.25); }
        }
      `}</style>

      {/* Streamers falling from the top edge */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-full pointer-events-none">
        {streamers.map((s) => (
          <div
            key={s.id}
            style={{
              position: 'absolute',
              top: 0,
              left: `${s.left}%`,
              width: 4,
              height: s.length,
              background: `linear-gradient(to bottom, ${s.hue}, transparent)`,
              transformOrigin: 'top center',
              transform: `rotate(${s.rotate}deg)`,
              borderRadius: 2,
              animation: `wc-unfurl ${s.duration}s ${s.delay}s ease-out both`,
            }}
          />
        ))}
      </div>

      {/* Confetti raining down */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        {confetti.map((c) => (
          <span
            key={c.id}
            style={{
              position: 'absolute',
              top: 0,
              left: `${c.left}%`,
              width: c.size,
              height: c.size * (c.rounded ? 1 : 0.55),
              background: c.color,
              borderRadius: c.rounded ? '9999px' : 2,
              boxShadow: `0 0 6px ${c.color}66`,
              ['--wc-drift' as string]: `${c.drift}px`,
              ['--wc-rot' as string]: `${c.rotate}deg`,
              animation: `wc-fall ${c.duration}s ${c.delay}s linear infinite`,
            }}
          />
        ))}
      </div>

      {/* Balloons drifting up with a gentle sway */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        {balloons.map((b) => (
          <div
            key={b.id}
            style={{
              position: 'absolute',
              bottom: -120,
              left: `${b.left}%`,
              width: b.size,
              height: b.size * 1.25,
              animation: `wc-rise ${b.duration}s ${b.delay}s ease-in both`,
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                ['--wc-sway' as string]: `${b.sway}px`,
                animation: `wc-sway ${1.5 + b.id * 0.2}s ease-in-out infinite`,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '82%',
                  borderRadius: '50%',
                  background: `radial-gradient(circle at 30% 30%, #ffffff88, ${b.color} 55%, ${b.color}cc 100%)`,
                  boxShadow: `inset -8px -10px 18px ${b.color}aa, 0 10px 24px rgba(0,0,0,0.35)`,
                  position: 'relative',
                }}
              >
                {/* Knot */}
                <span
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: -6,
                    width: 8,
                    height: 10,
                    background: b.color,
                    transform: 'translateX(-50%) rotate(45deg)',
                    borderRadius: 1,
                  }}
                />
              </div>
              {/* String */}
              <div
                style={{
                  width: 2,
                  height: '30%',
                  margin: '0 auto',
                  background: 'rgba(245,236,217,0.5)',
                  borderRadius: 1,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Centre card: headline + rankings. Everything above is aria-hidden. */}
      <div className="relative h-full flex items-center justify-center px-4">
        <div className="w-[min(440px,92vw)] rounded-2xl bg-night-raised/95 border border-brass/50 shadow-float px-7 py-7 text-parchment text-center">
          <div
            className="inline-flex items-center gap-2 justify-center font-display text-4xl tracking-tight text-brass-bright"
            style={{
              animation: 'wc-pop 650ms cubic-bezier(0.22, 1, 0.36, 1) both, wc-shimmer 2.4s ease-in-out 650ms infinite',
              textShadow: '0 2px 18px rgba(232,201,138,0.45)',
            }}
          >
            <span aria-hidden>🎉</span>
            <span>{en.gameOver.title}</span>
            <span aria-hidden>🎉</span>
          </div>

          {winner ? (
            <p
              className="mt-3 text-xl font-display"
              style={{ animation: 'wc-pop 700ms 180ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
            >
              <span className="uppercase tracking-[0.22em] text-brass/80 text-xs mr-2 align-middle">
                {en.gameOver.winnerLabel}
              </span>
              <span className="text-parchment">
                {isSelfWinner ? en.gameOver.youLabel : winner.displayName}
              </span>
            </p>
          ) : (
            <p className="mt-3 text-parchment/70 text-sm italic">
              {en.gameOver.noWinner}
            </p>
          )}

          <ul
            className="mt-5 divide-y divide-brass/10 border border-brass/15 rounded-lg overflow-hidden text-left"
            style={{ animation: 'wc-pop 700ms 320ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
          >
            {ranked.map((p, idx) => (
              <li
                key={p.playerId}
                className={[
                  'flex items-center justify-between px-3 py-2 text-sm',
                  idx === 0
                    ? 'bg-brass/10 text-brass-bright'
                    : 'text-parchment/85',
                ].join(' ')}
              >
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-parchment/50 w-5">
                    {idx + 1}.
                  </span>
                  <span>
                    {p.playerId === selfPlayerId
                      ? en.gameOver.youLabel
                      : p.displayName}
                  </span>
                  {p.isOut && (
                    <span className="text-[0.65rem] uppercase tracking-wider text-brass-bright/80 ml-1">
                      {en.gameOver.outLabel}
                    </span>
                  )}
                </span>
                <span className="font-display tabular-nums">{p.score ?? 0}</span>
              </li>
            ))}
          </ul>

          <a
            href="/"
            className="mt-6 inline-flex justify-center w-full px-4 py-2 rounded-full bg-gradient-to-b from-brass-bright to-brass text-night font-semibold hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary"
            style={{ animation: 'wc-pop 700ms 460ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
          >
            {en.gameOver.backToLobby}
          </a>
        </div>
      </div>
    </div>
  );
}
