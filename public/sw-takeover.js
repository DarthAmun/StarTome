// Loaded by the service worker (vite.config.ts, workbox.importScripts).
// The first install over v0.42 takes over at once: v0.42's page never sends the
// SKIP_WAITING message the new app's Reload button sends, so the new worker would
// wait for every v0.42 window to close, and an installed v0.42 rarely closes all.
// v0.42 is recognised by its offline cache, which holds Nuxt's /_nuxt/ files.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      const requests = await (await caches.open(name)).keys()
      if (requests.some(r => r.url.includes('/_nuxt/'))) { await self.skipWaiting(); return }
    }
  })())
})
