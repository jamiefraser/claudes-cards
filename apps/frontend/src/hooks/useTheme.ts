/**
 * useTheme — pick one of the three design directions.
 *
 * Setting the theme writes `data-theme` to <html> so every CSS variable
 * in `tokens.css` re-binds without a component re-render. The choice is
 * persisted to localStorage so the page reloads in the user's theme.
 *
 * Server-side rendering is irrelevant here (Vite SPA), so we can read
 * localStorage in the initial state without a hydration guard.
 */
import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/utils/logger';

export type ThemeName = 'salon' | 'riso' | 'obsidian';

export interface ThemeDescriptor {
  id: ThemeName;
  label: string;
  tagline: string;
  swatches: readonly string[];
}

export const THEMES: readonly ThemeDescriptor[] = [
  {
    id: 'salon',
    label: 'Le Salon',
    tagline: 'Literary, warm paper, ochre accent.',
    swatches: ['#f4ead8', '#1d1812', '#b57b2d', '#2b3e2a'],
  },
  {
    id: 'riso',
    label: 'Bodega Riso',
    tagline: 'Risograph zine — warm cream + tomato.',
    swatches: ['#f8eed3', '#1a1612', '#e24d2a', '#0e4e54'],
  },
  {
    id: 'obsidian',
    label: 'Obsidian Club',
    tagline: 'Cinematic noir with one acid accent.',
    swatches: ['#0b0d10', '#ebe6dc', '#c5ff4a', '#05231f'],
  },
] as const;

const STORAGE_KEY = 'card-platform:theme';

function readInitialTheme(): ThemeName {
  if (typeof window === 'undefined') return 'salon';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'salon' || raw === 'riso' || raw === 'obsidian') return raw;
  } catch {
    // localStorage blocked — default below
  }
  return 'salon';
}

/** Apply the theme attribute imperatively — call from the provider. */
function applyThemeAttribute(theme: ThemeName) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  // Keep the <meta name="theme-color"> in sync so mobile browser chrome
  // tracks the palette. The values mirror the --paper CSS var per theme.
  const paperByTheme: Record<ThemeName, string> = {
    salon: '#f4ead8',
    riso: '#f8eed3',
    obsidian: '#0b0d10',
  };
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = paperByTheme[theme];
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(() => readInitialTheme());

  // Apply on mount + whenever the theme changes.
  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeName) => {
    logger.debug('useTheme: setTheme', { next });
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage blocked — session-only theme change
    }
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
