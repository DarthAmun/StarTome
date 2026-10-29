/**
 * What the GM window sends to the player view (FORK_PLAN §14 PERF-01, BUG-11).
 *
 * - **Whitelist**: a token carries only what the player canvas draws. GM
 *   notes, AC, initiative, compendium/NPC links and hidden conditions/timers
 *   never leave the GM window; non-PC HP becomes a health state.
 * - **Small**: the map and every image (multi-MB data URLs) are sent once per
 *   player connection. Later messages refer to an image by a short key.
 * - **Plain**: everything is built from plain values, so postMessage can clone
 *   it without a JSON round-trip.
 */
import { healthState, type HealthState } from '~/composables/useConditions'

export interface PlayerTokenSource {
  id: number
  name: string
  label: string | null
  imageSource: string | null
  gridX: number
  gridY: number
  size: number
  isVisible: boolean
  isDead: boolean
  isPlayerToken: boolean
  visionRange: number | null
  elevation: number | null
  hpCurrent: number | null
  hpMax: number | null
  conditions: { name: string; value: number | null; hidden?: boolean; color?: string; icon?: string }[]
  timers: { id: string; name: string; remaining: number; duration: number; visibleToPlayers?: boolean }[]
}

export interface PlayerToken extends Omit<PlayerTokenSource, 'conditions' | 'timers'> {
  conditions: PlayerTokenSource['conditions']
  timers: PlayerTokenSource['timers']
  playerHealthState?: HealthState
}

/** Long sources (data URLs) travel once; after that a key stands for them. */
const INLINE_LIMIT = 2048

export function imageKey(src: string): string {
  if (src.length <= INLINE_LIMIT) return src
  // FNV-1a over a sparse sample plus the length: cheap on multi-MB strings
  let h = 0x811c9dc5
  const step = Math.max(1, Math.floor(src.length / 4096))
  for (let i = 0; i < src.length; i += step) h = Math.imul(h ^ src.charCodeAt(i), 0x01000193)
  for (let i = Math.max(0, src.length - 256); i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 0x01000193)
  return `img#${src.length.toString(36)}:${(h >>> 0).toString(36)}`
}

/** Tracks which images a player connection already has. */
export class ImageChannel {
  private sent = new Set<string>()
  private pending: Record<string, string> = {}
  reset() { this.sent.clear(); this.pending = {} }
  /** The key for `src`; queues the full source if this connection hasn't had it yet. */
  ref(src: string | null | undefined): string | null {
    if (!src) return null
    const key = imageKey(src)
    if (key !== src && !this.sent.has(key)) {
      this.sent.add(key)
      this.pending[key] = src
    }
    return key
  }
  /** New images since the last message, then forgets them. */
  take(): Record<string, string> | undefined {
    const out = this.pending
    this.pending = {}
    return Object.keys(out).length ? out : undefined
  }
}

export function toPlayerToken(t: PlayerTokenSource, images: ImageChannel): PlayerToken {
  const out: PlayerToken = {
    id: t.id, name: t.name, label: t.label, imageSource: images.ref(t.imageSource),
    gridX: t.gridX, gridY: t.gridY, size: t.size, isVisible: t.isVisible, isDead: t.isDead,
    isPlayerToken: t.isPlayerToken, visionRange: t.visionRange, elevation: t.elevation,
    hpCurrent: t.isPlayerToken ? t.hpCurrent : null,
    hpMax: t.isPlayerToken ? t.hpMax : null,
    conditions: t.conditions.filter(c => !c.hidden).map(c => ({ name: c.name, value: c.value, color: c.color, icon: c.icon })),
    timers: t.timers.filter(x => x.visibleToPlayers).map(x => ({ id: x.id, name: x.name, remaining: x.remaining, duration: x.duration, visibleToPlayers: true })),
  }
  if (!t.isPlayerToken) out.playerHealthState = healthState(t)
  return out
}

/** Player side: puts the real sources back in place of the keys. */
export class ImageCache {
  private byKey = new Map<string, string>()
  add(images: Record<string, string> | undefined) {
    for (const [k, v] of Object.entries(images ?? {})) this.byKey.set(k, v)
  }
  resolve(key: string | null | undefined): string | null {
    if (!key) return null
    return key.startsWith('img#') ? this.byKey.get(key) ?? null : key
  }
}
