/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    // Brief-mandated breakpoints: 640 / 1024 / 1440.
    // `md:` used to mean 768 — most `md:` usages in the codebase want
    // "tablet+", which is now 1024. `lg:` used to mean 1024 — most
    // `lg:` usages want "desktop+", which is now 1440.
    screens: {
      sm: '640px',
      md: '1024px',
      lg: '1440px',
    },
    extend: {
      colors: {
        // ── Le Salon semantic tokens ────────────────────────────────
        paper:          'rgb(var(--paper) / <alpha-value>)',
        'paper-raised': 'rgb(var(--paper-raised) / <alpha-value>)',
        'paper-deep':   'rgb(var(--paper-deep) / <alpha-value>)',
        ink:            'rgb(var(--ink) / <alpha-value>)',
        'ink-soft':     'rgb(var(--ink-soft) / <alpha-value>)',
        whisper:        'rgb(var(--whisper) / <alpha-value>)',
        hairline:       'rgb(var(--hairline) / <alpha-value>)',
        ochre:          'rgb(var(--ochre) / <alpha-value>)',
        'ochre-hi':     'rgb(var(--ochre-hi) / <alpha-value>)',
        burgundy:       'rgb(var(--burgundy) / <alpha-value>)',
        sage:           'rgb(var(--sage) / <alpha-value>)',
        'accent-fg':    'rgb(var(--accent-fg) / <alpha-value>)',

        // ── Legacy aliases, repointed to Le Salon semantics ─────────
        // Kept so existing classNames render in-theme without a mass
        // rename. Migrate to semantic names (paper/ink/ochre) over time.
        brand: {
          primary:   'rgb(var(--ochre) / <alpha-value>)',
          secondary: 'rgb(var(--ochre-hi) / <alpha-value>)',
        },
        bot: 'rgb(var(--bot) / <alpha-value>)',
        felt: {
          DEFAULT:   'rgb(var(--felt) / <alpha-value>)',
          deep:      'rgb(var(--felt-deep) / <alpha-value>)',
          edge:      'rgb(var(--felt-edge) / <alpha-value>)',
          highlight: 'rgb(var(--felt-light) / <alpha-value>)',
        },
        brass: {
          DEFAULT: 'rgb(var(--ochre) / <alpha-value>)',
          dim:     'rgb(var(--hairline) / <alpha-value>)',
          bright:  'rgb(var(--ochre-hi) / <alpha-value>)',
        },
        parchment: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          warm:    'rgb(var(--ink-soft) / <alpha-value>)',
          ink:     'rgb(var(--ink) / <alpha-value>)',
          rule:    'rgb(var(--hairline) / <alpha-value>)',
        },
        night: {
          DEFAULT: 'rgb(var(--paper) / <alpha-value>)',
          raised:  'rgb(var(--paper-raised) / <alpha-value>)',
        },

        // `text-white` semantically means "primary foreground" in the
        // legacy dark theme. In Le Salon that's ink (dark). Components
        // that want a literal white card-face surface use `bg-[#fff]`.
        white: 'rgb(var(--ink) / <alpha-value>)',

        // ── Tailwind palette overrides for Le Salon mapping ─────────
        // Components still reference bg-slate-XXX / text-indigo-XXX
        // etc. These remaps keep those looking right without a bulk
        // find-replace across 47 files. Values chosen so the intent
        // (dark surface, brand accent, success, error) survives.
        slate: {
          50:  'rgb(var(--paper) / <alpha-value>)',
          100: 'rgb(var(--paper-raised) / <alpha-value>)',
          200: 'rgb(var(--paper-deep) / <alpha-value>)',
          300: 'rgb(var(--hairline) / <alpha-value>)',
          400: 'rgb(var(--whisper) / <alpha-value>)',
          500: 'rgb(var(--whisper) / <alpha-value>)',
          600: 'rgb(var(--ink-soft) / <alpha-value>)',
          700: 'rgb(var(--paper-deep) / <alpha-value>)',
          800: 'rgb(var(--paper-raised) / <alpha-value>)',
          900: 'rgb(var(--paper) / <alpha-value>)',
        },
        indigo: {
          50:  'rgb(var(--paper-raised) / <alpha-value>)',
          100: 'rgb(var(--paper-deep) / <alpha-value>)',
          200: 'rgb(var(--ochre-hi) / <alpha-value>)',
          300: 'rgb(var(--ochre-hi) / <alpha-value>)',
          400: 'rgb(var(--ochre) / <alpha-value>)',
          500: 'rgb(var(--ochre) / <alpha-value>)',
          600: 'rgb(var(--ochre) / <alpha-value>)',
          700: 'rgb(var(--ochre-hi) / <alpha-value>)',
          800: 'rgb(var(--burgundy) / <alpha-value>)',
          900: 'rgb(var(--burgundy) / <alpha-value>)',
        },
        sky: {
          400: 'rgb(var(--ochre-hi) / <alpha-value>)',
          500: 'rgb(var(--ochre-hi) / <alpha-value>)',
          600: 'rgb(var(--ochre) / <alpha-value>)',
        },
        emerald: {
          300: 'rgb(var(--sage) / <alpha-value>)',
          400: 'rgb(var(--sage) / <alpha-value>)',
          500: 'rgb(var(--sage) / <alpha-value>)',
        },
        rose: {
          400: 'rgb(var(--burgundy) / <alpha-value>)',
          500: 'rgb(var(--burgundy) / <alpha-value>)',
          600: 'rgb(var(--burgundy) / <alpha-value>)',
        },
        amber: {
          400: 'rgb(var(--ochre) / <alpha-value>)',
          500: 'rgb(var(--ochre) / <alpha-value>)',
        },
        // Keep red/green semantics but warm them to match Le Salon.
        red: {
          500: 'rgb(var(--burgundy) / <alpha-value>)',
          600: 'rgb(var(--burgundy) / <alpha-value>)',
        },
        green: {
          400: 'rgb(var(--sage) / <alpha-value>)',
          500: 'rgb(var(--sage) / <alpha-value>)',
        },
        yellow: {
          500: 'rgb(var(--ochre) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans:    ['Commissioner', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'turn-glow':  '0 0 0 1px rgb(var(--ochre) / 0.55), 0 0 28px 2px rgb(var(--ochre) / 0.18)',
        'felt-rim':   'inset 0 0 0 1px rgb(var(--hairline) / 0.35), 0 30px 80px -30px rgb(var(--ink) / 0.35)',
        'float':      '0 20px 40px -20px rgb(var(--ink) / 0.25), 0 0 0 1px rgb(var(--hairline) / 0.45)',
        'lift':       '0 14px 36px -18px rgb(var(--ink) / 0.35), 0 0 0 1px rgb(var(--hairline) / 0.6)',
        'drawer':     '24px 0 60px -20px rgb(var(--ink) / 0.3)',
        'paper':      '0 2px 6px -3px rgb(var(--ink) / 0.18), 0 12px 28px -18px rgb(var(--ink) / 0.22)',
      },
      keyframes: {
        'seat-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'turn-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 1px rgb(var(--ochre) / 0.40), 0 0 16px 1px rgb(var(--ochre) / 0.15)' },
          '50%':      { boxShadow: '0 0 0 1px rgb(var(--ochre) / 0.80), 0 0 26px 4px rgb(var(--ochre) / 0.32)' },
        },
        'drawer-in': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'rule-sweep': {
          '0%':   { transform: 'scaleX(0)', transformOrigin: '0 50%' },
          '100%': { transform: 'scaleX(1)', transformOrigin: '0 50%' },
        },
        'card-arrive': {
          '0%':   { opacity: '0', transform: 'translateY(-48px) scale(0.94)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'seat-in':    'seat-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'turn-pulse': 'turn-pulse 2600ms ease-in-out infinite',
        'drawer-in':  'drawer-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'rule-sweep': 'rule-sweep 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'card-arrive':'card-arrive 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
