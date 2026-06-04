/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        base: '#0b0c0e',
        panel: '#131518',
        'panel-2': '#181b20',
        elevated: '#1d2127',
        line: 'rgba(255,255,255,0.08)',
        'line-soft': 'rgba(255,255,255,0.05)',
        ink: '#ECEDEE',
        muted: '#969ba5',
        faint: '#5f646e',
        lime: {
          DEFAULT: '#C8F24E',
          dim: '#9ec23c',
          deep: '#3c4a18',
        },
        positive: '#5BD98A',
        warn: '#F4BD50',
        critical: '#FB6E72',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 24px 60px -28px rgba(0,0,0,0.8)',
        glow: '0 0 0 1px rgba(200,242,78,0.25), 0 8px 30px -8px rgba(200,242,78,0.25)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        rise: 'rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        fade: 'fade 0.5s ease both',
      },
    },
  },
  plugins: [],
}
