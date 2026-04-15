import React from 'react';
import type { Card } from '@shared/cards';
import { CardComponent } from '../cards/CardComponent';

export interface GinRummyShowdownPlayer {
  readonly playerId: string;
  readonly displayName: string;
  readonly isBot: boolean;
  readonly melds: Card[][];
  readonly deadwood: Card[];
  readonly deadwoodPts: number;
  readonly laidOff: Card[];
}

export interface GinRummyShowdownProps {
  readonly knockerId: string;
  readonly isGin: boolean;
  readonly knockerPts: number;
  readonly oppPts: number;
  readonly isUndercut: boolean;
  readonly players: readonly GinRummyShowdownPlayer[];
  readonly myPlayerId: string | undefined;
  readonly ackedIds: readonly string[];
}

function PlayerStrip({
  p,
  isKnocker,
  isGin,
  isUndercut,
  hasAcked,
  isMe,
}: {
  p: GinRummyShowdownPlayer;
  isKnocker: boolean;
  isGin: boolean;
  isUndercut: boolean;
  hasAcked: boolean;
  isMe: boolean;
}) {
  const label = isKnocker
    ? isGin ? (p.melds.flat().length === 11 ? 'Big Gin' : 'Gin') : 'Knock'
    : isUndercut ? 'Undercut' : '';

  return (
    <section
      className={[
        'rounded-2xl px-4 py-3 backdrop-blur',
        'bg-night-raised/75 border',
        isKnocker ? 'border-brass/45' : 'border-brass/15',
      ].join(' ')}
    >
      <header className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-3">
          <h3 className="font-display text-lg text-parchment">
            {p.displayName}
            {isMe && (
              <span className="ml-2 text-parchment/45 text-[0.6rem] tracking-wider uppercase">
                you
              </span>
            )}
            {p.isBot && (
              <span className="ml-2 text-bot text-[0.6rem] tracking-wider uppercase">
                bot
              </span>
            )}
          </h3>
          {label && (
            <span
              className={[
                'font-display italic text-sm',
                isKnocker ? 'text-brass-bright' : 'text-rose-300',
              ].join(' ')}
            >
              {label}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-3 text-xs">
          <span className="text-parchment/55 uppercase tracking-widest">
            deadwood
          </span>
          <span className="font-display text-brass-bright tabular-nums text-base">
            {p.deadwoodPts}
          </span>
          {hasAcked ? (
            <span className="text-brand-secondary text-[0.65rem] uppercase tracking-widest">
              ✓ acked
            </span>
          ) : (
            <span className="text-parchment/30 text-[0.65rem] uppercase tracking-widest">
              waiting
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-wrap gap-3 items-start">
        {p.melds.map((meld, mi) => (
          <div
            key={mi}
            className="flex flex-row items-center rounded-lg p-1.5 bg-night/40 border border-brass/20"
          >
            {meld.map((card, ci) => (
              <div
                key={card.id}
                style={{ marginLeft: ci === 0 ? 0 : -22 }}
              >
                <div className="scale-[0.6] origin-top-left -mr-7"><CardComponent card={card} faceUp selected={false} /></div>
              </div>
            ))}
          </div>
        ))}
        {p.laidOff.length > 0 && (
          <div
            className="flex flex-col gap-1"
            aria-label="laid off onto knocker"
          >
            <span className="text-[0.6rem] uppercase tracking-widest text-brand-secondary/80 font-display">
              Laid off · {p.laidOff.length}
            </span>
            <div className="flex flex-row items-center rounded-lg p-1.5 bg-brand-secondary/10 border border-brand-secondary/40">
              {p.laidOff.map((card, ci) => (
                <div key={card.id} style={{ marginLeft: ci === 0 ? 0 : -22 }}>
                  <div className="scale-[0.6] origin-top-left -mr-7">
                    <CardComponent card={card} faceUp selected={false} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {p.deadwood.length > 0 && (
          <div
            className="flex flex-col gap-1"
            aria-label="deadwood"
          >
            <span className="text-[0.6rem] uppercase tracking-widest text-rose-300/80 font-display">
              Deadwood · {p.deadwoodPts}
            </span>
            <div className="flex flex-row items-center rounded-lg p-1.5 bg-rose-950/40 border border-rose-900/40">
              {p.deadwood.map((card, ci) => (
                <div key={card.id} style={{ marginLeft: ci === 0 ? 0 : -22 }}>
                  <div className="scale-[0.6] origin-top-left -mr-7">
                    <CardComponent card={card} faceUp selected={false} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function GinRummyShowdown({
  knockerId,
  isGin,
  knockerPts,
  oppPts,
  isUndercut,
  players,
  myPlayerId,
  ackedIds,
}: GinRummyShowdownProps) {
  return (
    <div
      role="region"
      aria-label="Round showdown"
      className="w-full max-w-4xl mx-auto px-4 flex flex-col gap-3"
    >
      <header className="flex items-baseline justify-between px-1">
        <h2 className="font-display text-2xl text-parchment">
          Showdown
        </h2>
        <div className="flex items-baseline gap-4 font-display text-sm text-parchment/80">
          {knockerPts > 0 && (
            <span>
              <span className="text-parchment/55 uppercase tracking-widest text-xs mr-1.5">
                knocker
              </span>
              <span className="text-brass-bright tabular-nums">+{knockerPts}</span>
            </span>
          )}
          {oppPts > 0 && (
            <span>
              <span className="text-parchment/55 uppercase tracking-widest text-xs mr-1.5">
                opponent
              </span>
              <span className="text-brass-bright tabular-nums">+{oppPts}</span>
            </span>
          )}
        </div>
      </header>

      {players.map(p => (
        <PlayerStrip
          key={p.playerId}
          p={p}
          isKnocker={p.playerId === knockerId}
          isGin={isGin}
          isUndercut={isUndercut && p.playerId !== knockerId}
          hasAcked={ackedIds.includes(p.playerId)}
          isMe={p.playerId === myPlayerId}
        />
      ))}
    </div>
  );
}
