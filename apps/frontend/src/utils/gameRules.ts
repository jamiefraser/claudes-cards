/**
 * Per-game rules loader for the RulesPanel.
 *
 * Rules content lives in i18n bundles (currently `en.json`) keyed by gameId.
 * This keeps strings localizable (CLAUDE.md rule #10) — when additional locales
 * are added they need only mirror the same structure under their own bundle.
 *
 * Shape (per game):
 *   {
 *     title:        string,
 *     subtitle?:    string,
 *     attribution?: string,
 *     sections: Record<sectionKey, string[]>   // each value is an array of paragraphs
 *   }
 *
 * sectionKey is the id; its human title is looked up in `rules.sectionTitles`
 * so section labels are shared across games and can be retranslated once.
 */

import React from 'react';
import en from '@/i18n/en.json';
import type { RulesSection } from '@/components/table/RulesPanel';

interface GameRulesBundle {
  title: string;
  subtitle?: string;
  attribution?: string;
  sections: Record<string, readonly string[]>;
}

interface LoadedRules {
  title: string;
  subtitle?: string;
  attribution: string;
  sections: readonly RulesSection[];
}

const SECTION_ORDER = [
  'objective',
  'setup',
  'bidding',
  'play',
  'pegging',
  'tricks',
  'melds',
  'theShow',
  'specialCards',
  'scoring',
  'variants',
  'winning',
] as const;

export function loadRulesForGame(gameId: string): LoadedRules | null {
  const rulesRoot = en.rules as unknown as {
    games?: Record<string, GameRulesBundle>;
    sectionTitles?: Record<string, string>;
    attributionDefault: string;
  };

  // Game identifiers are inconsistent across the stack: the engine uses
  // compact names (`crazyeights`, `gofish`, `ohhell`), while the Room row
  // and lobby catalogue use hyphenated variants (`crazy-eights`, `go-fish`,
  // `oh-hell`). Normalize both sides so lookups match regardless of source.
  const key = gameId.toLowerCase().replace(/[-_\s]/g, '');
  const games = rulesRoot.games ?? {};
  const bundle =
    games[gameId] ??
    games[key] ??
    Object.entries(games).find(
      ([k]) => k.toLowerCase().replace(/[-_\s]/g, '') === key,
    )?.[1];
  if (!bundle) return null;

  const sectionTitles = rulesRoot.sectionTitles ?? {};
  const knownKeys = new Set<string>(SECTION_ORDER);

  const orderedKeys: string[] = [
    ...SECTION_ORDER.filter((k) => k in bundle.sections),
    ...Object.keys(bundle.sections).filter((k) => !knownKeys.has(k)),
  ];

  const sections: RulesSection[] = orderedKeys.map((key) => {
    const paragraphs = bundle.sections[key] ?? [];
    return {
      id: key,
      title: sectionTitles[key] ?? key,
      body: React.createElement(
        React.Fragment,
        null,
        paragraphs.map((p, i) => React.createElement('p', { key: i }, p)),
      ),
    };
  });

  return {
    title: bundle.title,
    subtitle: bundle.subtitle,
    attribution: bundle.attribution ?? rulesRoot.attributionDefault,
    sections,
  };
}
