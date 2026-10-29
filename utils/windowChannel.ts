/**
 * Messages between the GM window and the player windows (encounter player
 * view, map player) over BroadcastChannel. Every `on…` returns its own
 * unsubscribe function, so several listeners can coexist and each one is
 * removed by whoever added it.
 */
import { channelName, windowName } from '~/utils/appNamespace'

type Handler = (msg: any) => void

function createChannel(name: string) {
  let ch: BroadcastChannel | null = null
  const handlers = new Map<string, Set<Handler>>()
  function ensure() {
    if (!ch) {
      ch = new BroadcastChannel(channelName(name))
      ch.addEventListener('message', (e: MessageEvent) => {
        for (const h of handlers.get(e.data?.type) ?? []) h(e.data)
      })
    }
    return ch
  }
  return {
    post(type: string, data: object = {}) { ensure().postMessage({ ...data, type }) },
    on(type: string, h: Handler): () => void {
      ensure()
      let set = handlers.get(type)
      if (!set) handlers.set(type, (set = new Set()))
      set.add(h)
      return () => { set!.delete(h) }
    },
  }
}

function appUrl(hashPath: string) {
  // Hash routing: strip any existing hash from the pathname, then append the route
  return `${location.origin}${location.pathname.replace(/\/+$/, '')}/#${hashPath}`
}

export interface PingMessage { col: number; row: number; focus: boolean }

const player = createChannel('player')

export const playerWindow = {
  open(encounterId: number) {
    window.open(appUrl(`/encounter/${encounterId}/player`), windowName('player'), 'width=1280,height=800')
  },
  close() { player.post('close') },
  /** `data` must be structured-cloneable (no Vue proxies). */
  sync(data: object) { player.post('sync', { data }) },
  sendReady() { player.post('player-ready') },
  /** GM → player: "I'm here"; an open player view answers with ready. */
  sendHello() { player.post('gm-hello') },
  onHello(cb: () => void) { return player.on('gm-hello', () => cb()) },
  sendClosed() { player.post('player-closed') },
  sendPing(ping: PingMessage) { player.post('ping', ping) },
  onSync(cb: (data: any) => void) { return player.on('sync', m => cb(m.data)) },
  onReady(cb: () => void) { return player.on('player-ready', () => cb()) },
  onClosed(cb: () => void) { return player.on('player-closed', () => cb()) },
  onClose(cb: () => void) { return player.on('close', () => cb()) },
  onPing(cb: (ping: PingMessage) => void) { return player.on('ping', m => cb({ col: m.col, row: m.row, focus: !!m.focus })) },
}

const map = createChannel('map')

export const mapWindow = {
  open(campaignId: number, locationId: number) {
    window.open(appUrl(`/campaign/${campaignId}/map-player?locationId=${locationId}`), windowName('map-player'), 'width=1280,height=900')
  },
  sync(locationId: number | null) { map.post('map-sync', { locationId }) },
  onSync(cb: (locationId: number | null) => void) { return map.on('map-sync', m => cb(m.locationId)) },
}
