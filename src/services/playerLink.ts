/**
 * The link between the GM window and player windows on the same computer
 * (a second window, usually on the table's screen). Typed messages over
 * BroadcastChannel; the only module that uses it.
 */

export type PlayerMessage =
  | { type: 'map'; mapEntryId: string | null }
  | { type: 'graph'; graphId: string | null }
  | { type: 'hello'; channel: 'map' | 'graph' }

const CHANNEL = 'startome-next-player'
let channel: BroadcastChannel | null = null

function ch(): BroadcastChannel {
  channel ??= new BroadcastChannel(CHANNEL)
  return channel
}

export function sendToPlayers(message: PlayerMessage): void {
  ch().postMessage(message)
}

/** Listens for messages of one type. Returns the function that stops listening. */
export function onPlayerMessage<T extends PlayerMessage['type']>(type: T, handler: (m: Extract<PlayerMessage, { type: T }>) => void): () => void {
  const listener = (e: MessageEvent<PlayerMessage>) => { if (e.data?.type === type) handler(e.data as Extract<PlayerMessage, { type: T }>) }
  ch().addEventListener('message', listener)
  return () => ch().removeEventListener('message', listener)
}

export function openPlayerWindow(hashPath: string, name: string): void {
  window.open(`${location.origin}${location.pathname}#${hashPath}`, `startome-next-${name}`, 'width=1280,height=860')
}
