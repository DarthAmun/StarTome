import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

const base = process.env.APP_BASE_URL ?? '/'
// The preview at /StarTome/next/ is installed next to v0.42, so its window needs another name
const appName = base.endsWith('/next/') ? 'StarTome next' : 'StarTome'

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es' },
  // The text editor (CodeMirror) is one chunk of about 550 kB, loaded with the first editor
  build: { chunkSizeWarningLimit: 600 },
  // Only the sync worker uses jszip; found late, the dev server would reload the page under a sync in progress
  optimizeDeps: { include: ['jszip'] },
  plugins: [
    vue(),
    VitePWA({
      // 'prompt': a new version waits for a Reload click instead of replacing the app under a running session
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: 'startome-next',
        name: appName,
        short_name: appName,
        description: 'StarTome — your companion for Pathfinder 2e and Starfinder 2e campaigns',
        theme_color: '#14110f',
        background_color: '#14110f',
        display: 'standalone',
        orientation: 'landscape',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { maximumFileSizeToCacheInBytes: 3_000_000, navigateFallback: `${base}index.html`, globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'] },
      devOptions: { enabled: false },
    }),
  ],
})
