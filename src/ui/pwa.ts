/**
 * The installed app: registering the offline cache, telling you when a new
 * version is ready (it is never swapped in under a running session by itself),
 * and the browser's offer to install.
 */
import { ref } from 'vue'
import { notifySticky } from './dialogs'

interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export const canInstall = ref(false)
export const installed = ref(false)
/** 'none': no service worker here (development, or a browser without one). */
export const offline = ref<'none' | 'preparing' | 'ready'>('none')
export const updateReady = ref(false)

let prompt: InstallPrompt | null = null
let registration: ServiceWorkerRegistration | undefined

export async function installApp(): Promise<void> {
  if (!prompt) return
  await prompt.prompt()
  if ((await prompt.userChoice).outcome === 'accepted') { canInstall.value = false; prompt = null }
}

/** Lets the waiting version take over; the page reloads when it has (see `controllerchange` below). */
export function reloadForUpdate(): void {
  const waiting = registration?.waiting
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' })
  else location.reload()
}

/** Asks the server for a newer version now. Resolves false when there is no service worker to ask. */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false
  await registration.update()
  return true
}

function needRefresh(): void {
  updateReady.value = true
  notifySticky('A new version of StarTome is ready.', { label: 'Reload', run: reloadForUpdate })
}

/** A new worker that finished installing while an older one still serves this page is an update waiting. */
function watch(r: ServiceWorkerRegistration): void {
  registration = r
  if (r.waiting && navigator.serviceWorker.controller) needRefresh()
  r.addEventListener('updatefound', () => {
    const fresh = r.installing
    fresh?.addEventListener('statechange', () => { if (fresh.state === 'installed' && navigator.serviceWorker.controller) needRefresh() })
  })
}

export function startPwa(): void {
  installed.value = window.matchMedia('(display-mode: standalone)').matches
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); prompt = e as InstallPrompt; canInstall.value = true })
  window.addEventListener('appinstalled', () => { installed.value = true; canInstall.value = false })
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  offline.value = 'preparing'
  void navigator.serviceWorker.ready.then(() => { offline.value = 'ready' })
  // Reload once when the new version takes over, not when the very first worker claims the page
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload() } })
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).then(watch).catch(err => console.warn('offline cache not registered', err))
}
