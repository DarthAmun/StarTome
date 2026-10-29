import pkg from './package.json'
const baseURL = process.env.NUXT_APP_BASE_URL ?? '/'
// Ensure trailing slash, then strip leading slash from asset path
const asset = (path: string) => `${baseURL}${path}`.replace('//', '/')

export default defineNuxtConfig({
  ssr: false,

  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss',
    '@primevue/nuxt-module',
    '@vite-pwa/nuxt',
  ],

  app: {
    baseURL,
    head: {
      title: 'StarTome',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Offline-first campaign manager for Pathfinder 2e and Starfinder 2e GMs' },
        { name: 'theme-color', content: '#8b1a1a' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: asset('icons/favicon-32.png') },
        { rel: 'icon', type: 'image/x-icon', href: asset('favicon.ico') },
        { rel: 'apple-touch-icon', href: asset('icons/apple-touch-icon.png') },
      ],
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      id: 'startome',
      name: 'StarTome',
      short_name: 'StarTome',
      description: 'StarTome — your companion for Pathfinder 2e and Starfinder 2e campaigns',
      theme_color: '#8b1a1a',
      background_color: '#100808',
      display: 'standalone',
      orientation: 'landscape',
      start_url: baseURL,
      scope: baseURL,
      icons: [
        { src: asset('icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
        { src: asset('icons/icon-512.png'), sizes: '512x512', type: 'image/png' },
        { src: asset('icons/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB — covers the lazily loaded game-icons chunk
      navigateFallback: baseURL,
      navigateFallbackDenylist: [/^\/api\//],
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
    },
    devOptions: { enabled: false },
  },

  primevue: {
    options: { unstyled: true },
    importPT: { from: '~/assets/primevue-preset.ts' },
    components: {
      include: ['Button', 'InputText', 'InputNumber', 'Textarea', 'Select', 'Dialog', 'AutoComplete'],
    },
  },

  runtimeConfig: {
    public: { version: pkg.version },
  },

  // Fonts are bundled (latin subset, the weights the theme uses) so a first start offline looks right (PERF-13)
  // Both workers are module workers; ES output lets them share chunks with the app
  vite: { worker: { format: 'es' } },

  css: [
    '@fontsource/cinzel-decorative/latin-400.css',
    '@fontsource/cinzel-decorative/latin-700.css',
    '@fontsource/cinzel/latin-400.css',
    '@fontsource/cinzel/latin-600.css',
    '@fontsource/cinzel/latin-700.css',
    '@fontsource/im-fell-english/latin-400.css',
    '@fontsource/im-fell-english/latin-400-italic.css',
    '@fontsource/dm-sans/latin-400.css',
    '@fontsource/dm-sans/latin-500.css',
    '@fontsource/dm-sans/latin-600.css',
    '@fontsource/jetbrains-mono/latin-400.css',
    '@fontsource/jetbrains-mono/latin-500.css',
    '~/assets/css/main.css',
  ],
  tailwindcss: { configPath: '~/tailwind.config.ts' },
  router: { options: { hashMode: true } },
  components: [{ path: '~/components', pathPrefix: false }],
  imports: { dirs: ['stores', 'composables'] },
  compatibilityDate: '2024-04-03',
})
