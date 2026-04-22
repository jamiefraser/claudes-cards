/**
 * Phase10Objective — shows the current phase number + its objective
 * description above the player's own hand so they know what they're
 * trying to build. Includes a collapsible reference chart of all 10 phases
 * (from src/img/phase10/phase 10 phases.svg).
 */
import React, { useState } from 'react';
import en from '@/i18n/en.json';
import phasesChartUrl from '@/img/phase10/phase 10 phases.svg?url';

export interface Phase10ObjectiveProps {
  phase: number;
  laidDown: boolean;
}

export function Phase10Objective({ phase, laidDown }: Phase10ObjectiveProps) {
  const [showChart, setShowChart] = useState(false);
  const descriptions = en.table.phase10Descriptions as Record<string, string>;
  const desc = descriptions[String(phase)] ?? '';
  const phaseLabel = en.table.phase10YourPhase.replace('{num}', String(phase));
  const objective = en.table.phase10Objective.replace('{desc}', desc);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="flex flex-row items-center gap-2 sm:gap-3 px-3 py-1.5 rounded-full bg-paper-raised/80 border border-hairline/70 text-xs sm:text-sm max-w-full min-w-0"
        aria-label={`${phaseLabel}. ${objective}`}
      >
        <span className="font-display font-semibold text-ochre whitespace-nowrap">{phaseLabel}</span>
        <span className="text-ink-soft truncate min-w-0">{objective}</span>
        {laidDown && (
          <span className="text-sage text-xs font-medium whitespace-nowrap">
            ✓ laid down
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowChart((s) => !s)}
          className="ml-1 text-xs text-ochre hover:text-ochre-hi underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-hi rounded whitespace-nowrap"
          aria-expanded={showChart}
        >
          {showChart
            ? en.table.phase10HideAllPhases
            : en.table.phase10ShowAllPhases}
        </button>
      </div>
      {showChart && (
        // The phases SVG contains two side-by-side copies of the reference
        // chart. Show only the left copy by cropping the container.
        <div
          className="bg-[#ffffff] rounded-md p-2 shadow-lg overflow-hidden max-w-full"
          style={{ aspectRatio: '560 / 420' }}
        >
          <img
            src={phasesChartUrl}
            alt="Phase 10 phases reference chart"
            width={560}
            height={420}
            loading="lazy"
            style={{
              width: '200%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'left center',
            }}
          />
        </div>
      )}
    </div>
  );
}
