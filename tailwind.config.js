/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Numbers reuse Inter with tabular figures (see .tnum).
        mono: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        white: 'rgb(var(--color-overlay) / <alpha-value>)',
        base: 'rgb(var(--color-base) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        'panel-2': 'rgb(var(--color-panel-2) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        'line-soft': 'rgb(var(--color-line-soft) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        faint: 'rgb(var(--color-faint) / <alpha-value>)',
        lime: {
          DEFAULT: 'rgb(var(--color-lime) / <alpha-value>)',
          dim: 'rgb(var(--color-lime-dim) / <alpha-value>)',
          deep: 'rgb(var(--color-lime-deep) / <alpha-value>)',
        },
        'lime-fill': 'rgb(var(--color-lime-fill) / <alpha-value>)',
        'lime-fill-hover': 'rgb(var(--color-lime-fill-hover) / <alpha-value>)',
        positive: 'rgb(var(--color-positive) / <alpha-value>)',
        warn: 'rgb(var(--color-warn) / <alpha-value>)',
        critical: 'rgb(var(--color-critical) / <alpha-value>)',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        glow: 'var(--shadow-glow)',
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
