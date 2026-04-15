/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#4f46e5',
          secondary: '#0ea5e9',
        },
        surface: {
          DEFAULT: '#1e293b',
          raised: '#334155',
        },
        bot: '#a855f7',
        felt: {
          DEFAULT: '#0d4938',
          deep: '#08301f',
          edge: '#1a2419',
          highlight: '#13604a',
        },
        brass: {
          DEFAULT: '#c8a96a',
          dim: '#8a7446',
          bright: '#e8c98a',
        },
        parchment: {
          DEFAULT: '#f5ecd9',
          warm: '#efe1c4',
          ink: '#3b2a1a',
          rule: '#b8a478',
        },
        night: {
          DEFAULT: '#0a0f1e',
          raised: '#141a2e',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'turn-glow': '0 0 0 1px rgba(14,165,233,0.45), 0 0 28px 4px rgba(14,165,233,0.35)',
        'felt-rim': 'inset 0 0 0 1px rgba(200,169,106,0.55), 0 30px 80px -30px rgba(0,0,0,0.8)',
        'float': '0 20px 40px -20px rgba(0,0,0,0.65), 0 0 0 1px rgba(200,169,106,0.18)',
        'drawer': '24px 0 60px -20px rgba(0,0,0,0.7)',
      },
      keyframes: {
        'seat-in': {
          '0%':   { opacity: '0', transform: 'scale(0.92) translateY(6px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'turn-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 1px rgba(14,165,233,0.45), 0 0 18px 2px rgba(14,165,233,0.30)' },
          '50%':      { boxShadow: '0 0 0 1px rgba(14,165,233,0.80), 0 0 34px 8px rgba(14,165,233,0.50)' },
        },
        'drawer-in': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'seat-in':    'seat-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'turn-pulse': 'turn-pulse 2200ms ease-in-out infinite',
        'drawer-in':  'drawer-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
