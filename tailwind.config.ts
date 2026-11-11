import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Short viewports, e.g. a phone held sideways: drop secondary text so the instrument stays on screen.
      screens: { short: { raw: '(max-height: 520px)' } },
      colors: {
        ink: { 950: '#07080a', 900: '#0c0e12', 850: '#11141a', 800: '#161a21', 700: '#1f242d', 600: '#2a313c', 500: '#3a4350' },
        accent: { DEFAULT: '#f5b544', soft: '#ffd98a', deep: '#c98a1c' },
        right: '#4cc9f0',
        left: '#b794f6',
        good: '#4ade80',
        bad: '#f87171',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(245,181,68,.35), 0 0 24px -4px rgba(245,181,68,.45)',
        panel: '0 1px 0 rgba(255,255,255,.04) inset, 0 12px 32px -16px rgba(0,0,0,.8)',
      },
    },
  },
  plugins: [],
};
export default config;
