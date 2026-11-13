/**
 * The players' window: sends it the player-safe scene whenever the open
 * encounter changes (at most once a frame), and again when it (re)connects.
 * Pictures are not sent: both windows read them from the same local storage.
 */
import { ref, watch } from 'vue'
import { DEFAULT_PLAYER_PREFS, readPlayerPrefs, toPlayerScene, type PlayerViewPrefs } from '@/domain/rules/playerView'
import { wallsOf } from '@/data/encounters'
import { workspace } from '@/data/repo'
import { onPlayerMessage, openPlayerWindow, sendToPlayers, type PlayerMessage } from '@/services/playerLink'
import { areaCells } from './areasLive'
import { areas, live, mapTokens } from './live'
import { sightFor } from './scene'
import { zones } from './starshipLive'
import { order, round } from './turns'

export const playerPrefs = ref<PlayerViewPrefs>({ ...DEFAULT_PLAYER_PREFS })
/** The map's size in squares, told by the GM's canvas; sight ends at the map's edge. */
export const mapSquares = ref<{ w: number; h: number } | undefined>(undefined)

let queued = false
let stop: (() => void) | null = null

function send(): void {
  queued = false
  const enc = live.encounter, map = live.map
  if (!enc || !map) return
  const tokens = mapTokens()
  // The state is reactive; a message must be plain data
  sendToPlayers(JSON.parse(JSON.stringify({
    type: 'encounter',
    scene: toPlayerScene({
      encounterId: enc.id, map: enc.map, grid: enc.grid, fog: map.fog, tokens: live.tokens, order: order.value,
      zones: live.tokens.some(t => t.sensor) ? zones.value : null,
      areas: areas().map(a => ({ id: a.id, color: a.color, hidden: a.hidden, cells: [...areaCells(a)] })),
      // With sight on and the GM seeing everything, players see what their tokens see together
      lit: sightFor(enc.fovEnabled, live.fovMode === 'gm' ? 'group' : live.fovMode, tokens, live.activeId, wallsOf(map), mapSquares.value, false).lit,
      running: enc.status === 'active', round: round.value, activeId: live.activeId, prefs: playerPrefs.value,
    }),
  })) as PlayerMessage)
}

function schedule(): void {
  if (queued) return
  queued = true
  requestAnimationFrame(send)
}

/** Starts following the open encounter; returns the function that stops. */
export function startPlayerSync(campaignId: string): () => void {
  stop?.()
  void workspace.get<unknown>(campaignId, 'playerView', null).then((raw) => { playerPrefs.value = readPlayerPrefs(raw) })
  const offHello = onPlayerMessage('hello', (m) => { if (m.channel === 'encounter') send() })
  const offWatch = watch([() => live.encounter, () => live.map, () => live.tokens, () => live.activeId, () => live.fovMode, playerPrefs, mapSquares], schedule, { deep: true })
  send()
  stop = () => { offHello(); offWatch(); sendToPlayers({ type: 'encounter', scene: null }); stop = null }
  return stop
}

export function setPlayerPrefs(campaignId: string, change: Partial<PlayerViewPrefs>): void {
  playerPrefs.value = { ...playerPrefs.value, ...change }
  void workspace.set(campaignId, 'playerView', { ...playerPrefs.value })
}

export function openPlayers(): void {
  openPlayerWindow('/player/encounter', 'encounter')
}

export function pingPlayers(col: number, row: number, focus: boolean): void {
  sendToPlayers({ type: 'ping', col, row, focus })
}
