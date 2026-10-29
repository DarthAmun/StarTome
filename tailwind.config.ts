// tailwindcss comes in through @nuxtjs/tailwindcss and isn't a direct dependency, so no Config type here

export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
  ],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: 'var(--leather)',
          card: '#1a0a14',
          raised: '#242424',
          hover: '#2a2a2a',
          border: '#2e2e2e',
          text: '#ffffff',
          secondary: '#888888',
          muted: '#4a4a4a',
          gold: '#b8860b',
          'gold-l': '#f5cb4a',
          lime: '#a8e63d',
          'lime-l': '#c0f060',
          danger: '#8b1a1a',
          green: '#7cc44e',
        },
      },
      fontFamily: {
        display: ['DM Sans', 'system-ui', 'sans-serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        ui: ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
