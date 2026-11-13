/**
 * Areas on the open encounter's map: bursts, cones, lines and emanations that
 * know which tokens stand in them, ask for saves, and may linger and ask again
 * when a token enters or starts or ends its turn inside.
 */
import { cellsInArea, tokenInCells, type AreaOverlay, type AreaToken, type AreaTrigger } from '@/domain/rules/areas'
import type { Token } from '@/data/encounters'
import { areas, live, mapTokens, moveHooks, saveMap } from './live'
import { turnHooks } from './turns'

let nextPromptId = 1
export const asAreaToken = (t: Pick<Token, 'id' | 'x' | 'y' | 'size'>): AreaToken => ({ id: t.id, gridX: t.x, gridY: t.y, size: t.size })
export const areaCells = (a: AreaOverlay): Set<string> => cellsInArea(a, mapTokens().map(asAreaToken))

function write(list: AreaOverlay[]): void {
  saveMap({ areas: list as unknown as Record<string, unknown>[] }, true)
}

export function addArea(area: AreaOverlay): void { write([...areas(), area]) }
export function updateArea(id: string, changes: Partial<AreaOverlay>): void { write(areas().map(a => (a.id === id ? { ...a, ...changes } : a))) }

export function removeArea(id: string): void {
  write(areas().filter(a => a.id !== id))
  live.areaPrompts = live.areaPrompts.filter(p => p.areaId !== id)
}

/** Opens an area's save prompt: for the given tokens, or everyone inside. One prompt per area and token set is enough. */
export function openAreaPrompt(areaId: string, tokenIds: string[] | null = null, reason: string | null = null): void {
  if (live.areaPrompts.some(p => p.areaId === areaId && JSON.stringify(p.tokenIds) === JSON.stringify(tokenIds))) return
  live.areaPrompts = [...live.areaPrompts, { id: nextPromptId++, areaId, tokenIds, reason }]
}

export function closeAreaPrompt(id: number): void {
  live.areaPrompts = live.areaPrompts.filter(p => p.id !== id)
}

const lingering = (trigger: AreaTrigger) => areas().filter(a => a.effect && a.lingering?.trigger === trigger)

function ask(token: Token, trigger: AreaTrigger, verb: string): void {
  for (const a of lingering(trigger)) if (tokenInCells(areaCells(a), asAreaToken(token))) openAreaPrompt(a.id, [token.id], `${token.name} ${verb} ${a.label}`)
}

// A token walking into a lingering area: inside after the move, not before
moveHooks.push((t, x, y) => {
  for (const a of lingering('enter')) {
    const cells = areaCells(a)
    if (!tokenInCells(cells, asAreaToken(t)) && tokenInCells(cells, asAreaToken({ ...t, x, y }))) openAreaPrompt(a.id, [t.id], `${t.name} enters ${a.label}`)
  }
})
turnHooks.turnEnd = t => ask(t, 'turn-end', 'ends its turn in')
turnHooks.turnStart = t => ask(t, 'turn-start', 'starts its turn in')
// Areas whose last round has passed go away at the start of a round
turnHooks.newRound = (round) => {
  const done = new Set(areas().filter(a => a.lingering?.untilRound != null && round > a.lingering.untilRound).map(a => a.id))
  if (!done.size) return
  write(areas().filter(a => !done.has(a.id)))
  live.areaPrompts = live.areaPrompts.filter(p => !done.has(p.areaId))
}
