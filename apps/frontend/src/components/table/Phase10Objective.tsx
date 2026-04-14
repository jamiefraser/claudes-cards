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
        className="flex flex-row items-center gap-3 px-3 py-1 rounded-md bg-slate-800 border border-slate-700 text-sm"
        aria-label={`${phaseLabel}. ${objective}`}
      >
        <span className="font-semibold text-indigo-300">{phaseLabel}</span>
        <span className="text-slate-200">{objective}</span>
        {laidDown && (
          <span className="text-emerald-400 text-xs font-medium">
            ✓ laid down
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowChart((s) => !s)}
          className="ml-2 text-xs text-indigo-300 hover:text-indigo-200 underline focus:outline-none"
          aria-expanded={showChart}
        >
          {showChart ? 'Hide phases' : 'Show all phases'}
        </button>
      </div>
      {showChart && (
        // The phases SVG contains two side-by-side copies of the reference
        // chart. Show only the left copy by cropping the container.
        <div
          className="bg-white rounded-md p-2 shadow-lg overflow-hidden"
          style={{ width: 560, height: 420 }}
        >
          <img
            src={phasesChartUrl}
            alt="Phase 10 phases reference chart"
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
