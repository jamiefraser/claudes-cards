/**
 * formatScore — locale-aware numeric formatting for game scores.
 *
 * Phase 10 and Canasta scores cross 1,000 routinely (a 90-point phase
 * deduction + prior-hand score adds up fast). `Intl.NumberFormat` gives
 * us thousand separators in the user's locale instead of rendering
 * "1234" which reads as "twelve hundred thirty-four" at a glance.
 *
 * Signed mode is useful for deltas ("+84" / "±0" / "−12"). WIG:
 * "Use Intl for numbers and dates — never hardcoded formats."
 */

const DEFAULT_LOCALE: string | undefined = undefined; // fall back to browser default

const scoreFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
  maximumFractionDigits: 0,
});

const signedFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

export function formatScore(n: number): string {
  return scoreFormatter.format(Math.trunc(n));
}

export function formatDelta(n: number): string {
  if (n === 0) return '±0';
  return signedFormatter.format(Math.trunc(n));
}

/**
 * Pluralise via Intl.PluralRules — used for "1 game" / "2 games" etc.
 * `forms.one` handles the singular, `forms.other` the plural (and the
 * zero case which English treats as plural).
 */
const pluralRules = new Intl.PluralRules(DEFAULT_LOCALE);

export function pluralise(
  count: number,
  forms: { one: string; other: string },
): string {
  const category = pluralRules.select(count) === 'one' ? 'one' : 'other';
  return (forms[category] ?? forms.other).replace('{count}', formatScore(count));
}
