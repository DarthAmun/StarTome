/**
 * The players' window: sends it the player-safe scene whenever the open
 * encounter changes (at most once a frame), and again when it (re)connects.
 * Pictures are not sent: both windows read them from the same local storage.
 */
import { ref, watch } from 'vue'
import { DEFAULT_PLAYER_PREFS, readPlayerPrefs, toPlayerScene, type PlayerViewPrefs } from '@/domain/rules/playerView'
import { workspace } from '@/data/repo'
import { onPlayerMessage, openPlayerWindow, sendToPlayers, type PlayerMessage } from '@/services/playerLink'
import { areaCells } from './areasLive'
import { playersFloor } from '@/domain/rules/playerFloor'
import { areasOn, floors, floorWalls, live, mapTokens } from './live'
import { sightFor } from './scene'
import { zones } from './starshipLive'
import { order, round } from './turns'

export const playerPrefs = ref<PlayerViewPrefs>({ ...DEFAULT_PLAYER_PREFS })
/** The map's size in squares, told by the GM's canvas; sight ends at the map's edge. */
export const mapSquares = ref<{ w: number; h: number } | undefined>(undefined)

let queued = false
/** The floor the players' window shows (FloorView id), as last sent. */
let shownFloorId: string | null = null
let stop: (() => void) | null = null

function send(): void {
  queued = false
  const enc = live.encounter, map = live.map
  if (!enc || !map) return
  // The floor the players' tokens stand on (or the one they are kept on); nothing of the other floors is sent
  const seen = playersFloor(enc, map, mapTokens(), { gmFloor: live.floorId, locked: live.playerFloorId, activeId: live.activeId })
  const floor = seen.floor, tokens = seen.tokens, below = seen.below
  shownFloorId = floor.id
  // With sight on and the GM seeing everything, players see what their tokens see together;
  // an acting token on another floor sees nothing here, so then the party's sight counts
  const mode = live.fovMode === 'gm' || (live.fovMode === 'active' && !tokens.some(t => t.id === live.activeId)) ? 'group' : live.fovMode
  const sight = sightFor(enc.fovEnabled, mode, tokens, live.activeId, floorWalls(floor), mapSquares.value, false).lit
  // No darkness at all is drawn for an empty list: when the party stands on other floors only, this one stays dark
  const lit = enc.fovEnabled && !sight.length && mapTokens().some(t => t.playerToken) ? [[]] : sight
  // The state is reactive; a message must be plain data
  sendToPlayers(JSON.parse(JSON.stringify({
    type: 'encounter',
    scene: toPlayerScene({
      encounterId: enc.id, map: floor.image, grid: floor.grid, fog: floor.fog, tokens: [...live.tokens.filter(t => t.sensor), ...tokens], order: order.value,
      floorName: floors().length > 1 ? floor.name : null,
      below: below ? { map: below.floor.image, grid: below.floor.grid, fog: below.floor.fog, tokens: below.tokens } : null,
      zones: live.tokens.some(t => t.sensor) ? zones.value : null,
      areas: areasOn(floor.id).map(a => ({ id: a.id, color: a.color, hidden: a.hidden, cells: [...areaCells(a)] })),
      lit,
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
  const offWatch = watch([() => live.encounter, () => live.map, () => live.tokens, () => live.activeId, () => live.fovMode, () => live.floorId, () => live.playerFloorId, playerPrefs, mapSquares], schedule, { deep: true })
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
  // A ping on another floor than the players' would point them at a spot of the wrong map
  if (shownFloorId !== null && shownFloorId !== live.floorId) return
  sendToPlayers({ type: 'ping', col, row, focus })
}
