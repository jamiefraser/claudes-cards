/**
 * Logger utility for the frontend.
 * Respects VITE_LOG_LEVEL env var.
 * No console.log calls outside this module — CLAUDE.md rule 7.
 *
 * Levels: debug < info < warn < error
 * Default level: 'info' (debug suppressed in production builds).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  // import.meta.env is available in Vite/Vitest environments
  // Defensive fallback for environments where it may not be set
  const envLevel =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_LOG_LEVEL
      : undefined;
  const raw = (envLevel ?? 'info').toLowerCase();
  if (raw in LEVEL_ORDER) return raw as LogLevel;
  return 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getConfiguredLevel()];
}

/* eslint-disable no-console */
export const logger = {
  debug: (msg: string, ...args: unknown[]): void => {
    if (shouldLog('debug')) console.debug(`[DEBUG] ${msg}`, ...args);
  },
  info: (msg: string, ...args: unknown[]): void => {
    if (shouldLog('info')) console.info(`[INFO] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]): void => {
    if (shouldLog('warn')) console.warn(`[WARN] ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]): void => {
    if (shouldLog('error')) console.error(`[ERROR] ${msg}`, ...args);
  },
};
/* eslint-enable no-console */
