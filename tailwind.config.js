/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Satoshi', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Clash Display"', 'Satoshi', 'ui-sans-serif', 'sans-serif'],
        // Numbers reuse Satoshi with tabular figures (see .tnum) — no mono.
        mono: ['Satoshi', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        base: '#0a0a0b',
        panel: '#131316',
        'panel-2': '#17181c',
        elevated: '#1c1d22',
        line: 'rgba(255,255,255,0.07)',
        'line-soft': 'rgba(255,255,255,0.045)',
        ink: '#F4F4F5',
        muted: '#9b9ba4',
        faint: '#5e5e68',
        lime: {
          DEFAULT: '#C6F24E',
          dim: '#acd93f',
          deep: '#39431a',
        },
        positive: '#5BD98A',
        warn: '#F4BD50',
        critical: '#FB6E72',
      },
      boxShadow: {
        panel:
          '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 30px 60px -32px rgba(0,0,0,0.85)',
        glow: '0 6px 24px -8px rgba(198,242,78,0.4)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
}
