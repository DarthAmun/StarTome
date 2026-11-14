/**
 * The encounter that is open: one reactive state for the map, the turn order
 * and every panel. This file holds the state, loading, and what happens to
 * tokens (placing, moving, HP, conditions) and the log. Turns are in turns.ts,
 * areas in areasLive.ts, the players' window in playerSync.ts.
 *
 * Every change is written to the database as it happens; the map and the
 * players' window follow by watching this state.
 */
import { reactive } from 'vue'
import { DEFAULT_AUTOMATION, type AutomationSettings, type GameId } from '@/domain/game'
import { evaluateFormula } from '@/domain/formula'
import { parseDefeated, type DefeatedEnemy } from '@/domain/rules/advancement'
import type { AreaOverlay } from '@/domain/rules/areas'
import { freeSpots, rollInitiative, rulesScope, tokenStats, type Adjustment } from '@/domain/rules/combat'
import type { TokenCondition } from '@/domain/rules/conditions'
import { damageWithTemp, grantTemp } from '@/domain/rules/hp'
import { hpChangeEffects, type ConditionChange, type Degree, type TurnPromptSeed } from '@/domain/rules/turnEffects'
import type { Hazard, RulesEntity } from '@/domain/rules/types'
import type { ActorRef, CombatLogEntry, Encounter, EncounterMap } from '@/domain/schema'
import { actors, addCombatant, areasOf, combatLog, encounters, imageOfRules, makeLogEntry, patchCombatant, patchEncounter, patchMap, removeCombatants, statLinkOf, type CombatantInput, type CombatantPatch, type EncounterPatch, type LogInput, type Token } from '@/data/encounters'
import { campaignSettings } from '@/data/party'
import { rulesGet, rulesGetMany } from '@/data/rules'
import { reportError } from '@/ui/dialogs'

export type TurnPrompt = TurnPromptSeed & { id: number; tokenId: string; tokenName: string }
/** An area's saves to resolve: for the given tokens, or everyone inside when it opens. */
export interface AreaPrompt { id: number; areaId: string; tokenIds: string[] | null; reason: string | null }
export type FovMode = 'gm' | 'active' | 'group'
export type Mode = 'prepare' | 'run' | 'resolved'

export const live = reactive({
  encounter: null as Encounter | null,
  map: null as EncounterMap | null,
  tokens: [] as Token[],
  log: [] as CombatLogEntry[],
  game: 'pf2e' as GameId,
  automation: { ...DEFAULT_AUTOMATION } as AutomationSettings,
  /** Whose turn it is. Kept as an id so the turn stays put when the order changes. */
  activeId: null as string | null,
  fovMode: 'gm' as FovMode,
  selectedId: null as string | null,
  turnPrompts: [] as TurnPrompt[],
  /** Reminders for the token whose turn it is (actions lost or gained). */
  turnNotes: [] as { tokenId: string; text: string }[],
  areaPrompts: [] as AreaPrompt[],
})

const fail = (what: string) => (err: unknown) => reportError(what, err)
export const areas = (): AreaOverlay[] => (live.map ? areasOf(live.map) : [])
export const getToken = (id: string | null | undefined): Token | undefined => live.tokens.find(t => t.id === id)
export const usesDying = (t: Token): boolean => t.usesDying ?? t.playerToken
/** Tokens on the battle map (starships stand on the sensor map instead). */
export const mapTokens = (): Token[] => live.tokens.filter(t => !t.sensor)

// ── Loading ────────────────────────────────────────────────────────────────

export async function loadEncounter(id: string): Promise<boolean> {
  await flushSaves()
  const encounter = await encounters.get(id)
  if (!encounter) { live.encounter = null; return false }
  const [map, tokens, log, settings] = await Promise.all([encounters.map(id), encounters.tokens(id), encounters.log(id), campaignSettings(encounter.campaignId)])
  Object.assign(live, {
    encounter, map, tokens, log, game: settings.game, automation: settings.rules.automation, selectedId: null,
    turnPrompts: [], turnNotes: [], areaPrompts: [], fovMode: 'gm', activeId: null,
  })
  return true
}

export async function refreshTokens(): Promise<void> {
  if (live.encounter) live.tokens = await encounters.tokens(live.encounter.id)
}

// ── Saving ─────────────────────────────────────────────────────────────────

export function saveEncounter(patch: EncounterPatch): void {
  if (!live.encounter) return
  Object.assign(live.encounter, patch)
  patchEncounter(live.encounter.id, patch).catch(fail('Saving the encounter'))
}

// Fog strokes and panning touch the map row many times a second: written once they pause
let mapTimer: ReturnType<typeof setTimeout> | null = null
let mapPending: { id: string; patch: Partial<EncounterMap> } | null = null

export function saveMap(patch: Partial<Omit<EncounterMap, 'id'>>, now = false): void {
  if (!live.map) return
  Object.assign(live.map, patch)
  mapPending = { id: live.map.id, patch: { ...(mapPending?.id === live.map.id ? mapPending.patch : {}), ...patch } }
  if (mapTimer) clearTimeout(mapTimer)
  if (now) void flushSaves()
  else mapTimer = setTimeout(() => { void flushSaves() }, 400)
}

/** Writes anything still waiting (leaving the page, switching encounters). */
export async function flushSaves(): Promise<void> {
  if (mapTimer) { clearTimeout(mapTimer); mapTimer = null }
  const pending = mapPending
  mapPending = null
  if (pending) await patchMap(pending.id, pending.patch).catch(fail('Saving the map'))
}

function saveToken(id: string, patch: CombatantPatch): void {
  patchCombatant(id, patch).catch(fail('Saving the token'))
}

// ── Log ────────────────────────────────────────────────────────────────────

export type LogDetail = { value?: number; absorbed?: number; degree?: Degree; targetName?: string; attack?: boolean; conditionName?: string; note?: string; auto?: boolean }

/** Appends a line and returns its id. */
export function logLine(token: Pick<Token, 'id' | 'name'>, type: string, detail: LogDetail = {}): string | null {
  if (!live.encounter) return null
  const input: LogInput = { round: live.encounter.turn.round, combatantId: token.id, combatantName: token.name, type, detail }
  const entry = makeLogEntry(live.encounter.id, (live.log[live.log.length - 1]?.seq ?? -1) + 1, input)
  live.log.push(entry)
  combatLog.put(entry).catch(fail('Saving the combat log'))
  return entry.id
}

export function dropLog(ids: string[]): void {
  if (!ids.length) return
  const drop = new Set(ids)
  live.log = live.log.filter(e => !drop.has(e.id))
  combatLog.remove(ids).catch(fail('Saving the combat log'))
}

export function clearLog(): void {
  if (!live.encounter) return
  live.log = []
  combatLog.clear(live.encounter.id).catch(fail('Clearing the combat log'))
}

export function logChanges(token: Token, changes: ConditionChange[]): string[] {
  return changes.map(ch => logLine(token, ch.to === undefined ? 'condition-removed' : ch.from === undefined ? 'condition-added' : 'condition-changed', { auto: true, conditionName: ch.name, ...(ch.to != null ? { value: ch.to } : {}) }))
    .filter((id): id is string => !!id)
}

// ── Changing a token ───────────────────────────────────────────────────────

export interface HpOptions { /** The damage type as typed ("fire"); a linked player's app applies its resistances to it. */ type?: string; critical?: boolean; hitsAtZero?: number; absorbed?: number; /** Starships: the damage ignores Shield Points. */ bypassing?: boolean; nonlethal?: boolean; /** Starships: what got past the shields. */ hullDamage?: number }
/** Starships take damage their own way (shields first; the party's ship becomes compromised, not dying): starshipLive.ts fills these in. */
export const shipHooks = {
  damage: null as null | ((t: Token, amount: number, opts: HpOptions) => void),
  hpChange: null as null | ((t: Token, next: CombatantPatch, opts: HpOptions) => CombatantPatch),
}

/** Changes a token, logs what is worth logging, and adds dying, wounded and defeat to an HP change. */
export function updateToken(id: string, updates: CombatantPatch, opts: HpOptions = {}): void {
  const token = getToken(id)
  if (!token) return
  const next: CombatantPatch = { ...updates }
  if (next.hp && (next.hp.current !== token.hp.current || opts.hullDamage)) {
    if (token.sensor?.role === 'player-ship' && shipHooks.hpChange) Object.assign(next, shipHooks.hpChange(token, next, opts))
    else {
      const dying = next.usesDying !== undefined ? (next.usesDying ?? token.playerToken) : usesDying(token)
      const fx = hpChangeEffects(next.conditions ?? token.conditions, { from: token.hp.current, to: next.hp.current, ...opts }, dying, live.automation)
      if (fx.changes.length) { logChanges(token, fx.changes); token.conditions = fx.conditions; next.conditions = fx.conditions }
      if (fx.dead && !token.dead) next.dead = true
      if (fx.revived && token.dead) next.dead = false
    }
    const diff = next.hp.current !== null && token.hp.current !== null ? next.hp.current - token.hp.current : 0
    const absorbed = opts.absorbed ?? 0
    if (diff < 0 || absorbed > 0) logLine(token, 'damage', { value: Math.max(0, -diff) + absorbed, ...(absorbed ? { absorbed } : {}) })
    else if (diff > 0) logLine(token, 'healing', { value: diff })
  } else if (opts.absorbed) logLine(token, 'damage', { value: opts.absorbed, absorbed: opts.absorbed })
  if (next.hp && next.hp.temp > token.hp.temp) logLine(token, 'temp-hp', { value: next.hp.temp })
  if (next.dead !== undefined && next.dead !== token.dead) logLine(token, next.dead ? 'death' : 'revival')
  if (next.conditions && next.conditions !== token.conditions) {
    const before = new Set(token.conditions.map(c => c.name)), after = new Set(next.conditions.map(c => c.name))
    for (const n of after) if (!before.has(n)) logLine(token, 'condition-added', { conditionName: n })
    for (const n of before) if (!after.has(n)) logLine(token, 'condition-removed', { conditionName: n })
  }
  Object.assign(token, next)
  // The name shown comes from the label, or from what the token stands for: read again once it is written
  if (next.label !== undefined) patchCombatant(id, next).then(refreshTokens).catch(fail('Saving the token'))
  else saveToken(id, next)
}

/** Damage through temporary HP first; a negative amount heals. */
export function applyDamage(id: string, amount: number, opts: HpOptions = {}): void {
  const t = getToken(id)
  if (!t || t.hp.current === null || !amount) return
  if (amount < 0) {
    if (!t.sensor) for (const fn of damageHooks) fn(t, amount, opts)
    updateToken(id, { hp: { ...t.hp, current: Math.min(t.hp.max ?? Infinity, t.hp.current - amount) } }, opts)
    return
  }
  if (t.sensor && shipHooks.damage) { shipHooks.damage(t, amount, opts); return }
  for (const fn of damageHooks) fn(t, amount, opts)
  const r = damageWithTemp({ hp: t.hp.current, temp: t.hp.temp }, amount)
  updateToken(id, { hp: { ...t.hp, current: r.hp, temp: r.temp } }, { ...opts, hitsAtZero: t.hp.current <= 0 && amount > r.absorbed ? 1 : 0, absorbed: r.absorbed })
}

/** Told about damage dealt to a token, or healing (a negative amount), and about conditions put on it: a linked player's app is sent them. */
export const damageHooks: ((t: Token, amount: number, opts: HpOptions) => void)[] = []
export const conditionHooks: ((t: Token, added: { name: string; value: number | null }[]) => void)[] = []
export const initiativeModifier = { of: (_t: Token): number => 0 }

/** Temporary HP do not stack: the higher value stays. */
export function grantTempHp(id: string, amount: number): void {
  const t = getToken(id)
  if (t && grantTemp(t.hp.temp, amount) !== t.hp.temp) updateToken(id, { hp: { ...t.hp, temp: grantTemp(t.hp.temp, amount) } })
}

/** Adds conditions (an area's save); one the token has keeps the higher value. */
export function addConditions(id: string, conds: { name: string; value: number | null }[], look: (name: string) => Partial<TokenCondition> = () => ({})): void {
  const t = getToken(id)
  if (!t || !conds.length) return
  for (const fn of conditionHooks) fn(t, conds)
  const next = t.conditions.map(c => ({ ...c }))
  for (const add of conds) {
    const have = next.find(c => c.name.toLowerCase() === add.name.toLowerCase())
    if (!have) next.push({ ...look(add.name), name: add.name, value: add.value })
    else if (add.value !== null && (have.value ?? 0) < add.value) have.value = add.value
  }
  updateToken(id, { conditions: next })
}

export function moveToken(id: string, x: number, y: number): void {
  const t = getToken(id)
  if (!t) return
  for (const fn of moveHooks) fn(t, x, y)
  t.x = x
  t.y = y
  saveToken(id, { x, y })
}
/** Lets areasLive.ts ask for saves when a token walks into a lingering area. */
export const moveHooks: ((t: Token, x: number, y: number) => void)[] = []

/** Removes tokens. In a running fight, enemies with a stat block keep their XP on the encounter. */
export async function removeTokens(ids: string[], remember = false): Promise<void> {
  const gone = live.tokens.filter(t => ids.includes(t.id))
  if (!gone.length || !live.encounter) return
  if (remember) {
    const foes = gone.filter(t => !t.playerToken && !t.ally && statLinkOf(t))
    const entries = new Map((await rulesGetMany([...new Set(foes.map(t => statLinkOf(t)?.rulesId ?? ''))])).map(e => [e.id, e]))
    const added: DefeatedEnemy[] = []
    for (const t of foes) {
      const link = statLinkOf(t), e = link ? entries.get(link.rulesId) : undefined
      if (e && link && (e.kind === 'creature' || e.kind === 'hazard')) added.push({ name: t.name, rulesId: e.id, level: e.level, kind: e.kind, complex: e.kind === 'hazard' ? (e as Hazard).complex : undefined, adjustment: link.adjustment })
    }
    if (added.length) saveEncounter({ defeated: [...parseDefeated(live.encounter.defeated), ...added] as unknown as Record<string, unknown>[] })
  }
  live.tokens = live.tokens.filter(t => !ids.includes(t.id))
  if (live.selectedId && ids.includes(live.selectedId)) live.selectedId = null
  await removeCombatants(ids).catch(fail('Removing the token'))
}

// ── Placing tokens ─────────────────────────────────────────────────────────

/** How tokens join an encounter. */
export interface PlaceOptions { count?: number; /** Look for free squares even for one token. */ spread?: boolean; ally?: boolean; rollInitiative?: boolean; announce?: boolean }

function spots(x: number, y: number, size: number, opts: PlaceOptions): { x: number; y: number }[] {
  const count = Math.max(1, Math.min(20, Math.floor(opts.count ?? 1)))
  if (count === 1 && !opts.spread) return [{ x, y }]
  return freeSpots({ x, y }, mapTokens().map(t => ({ gridX: t.x, gridY: t.y, size: t.size })), count, size)
}

async function place(inputs: CombatantInput[], opts: PlaceOptions): Promise<Token[]> {
  if (!live.encounter) return []
  const ids: string[] = []
  for (const input of inputs) ids.push((await addCombatant(live.encounter.id, { ...input, ally: opts.ally ?? input.ally ?? false })).id)
  await refreshTokens()
  const added = live.tokens.filter(t => ids.includes(t.id))
  if (opts.announce) for (const t of added) logLine(t, 'note', { note: 'joined the fight' })
  return added
}

/** One token's initiative: the encounter's formula when set, else Perception (Stealth for hazards) of its stat block. */
export function initiativeFor(token: { hp: Token['hp']; ac: number | null }, entry: RulesEntity | undefined, adjustment: Adjustment | null, modifier = 0): number {
  const formula = live.encounter?.initiativeFormula?.trim()
  if (formula) {
    const scope: Record<string, number> = { ...rulesScope(entry, adjustment), ac: token.ac ?? 0, hp: token.hp.current ?? 0, hpmax: token.hp.max ?? 0, temphp: token.hp.temp }
    if (!entry) scope.perception = modifier
    return evaluateFormula(formula, scope)
  }
  return entry ? rollInitiative(entry, adjustment) : Math.floor(Math.random() * 20) + 1 + modifier
}

/** Places a compendium creature, hazard or vehicle without a library token. */
export async function placeCreature(rulesId: string, x: number, y: number, adjustment: Adjustment | null = null, opts: PlaceOptions = {}): Promise<Token[]> {
  const entry = await rulesGet(rulesId).catch(() => undefined)
  if (!entry) return []
  const stats = tokenStats(entry, adjustment)
  const hp = { current: stats.hpMax, max: stats.hpMax, temp: 0 }
  const image = imageOfRules((entry as { tokenImg?: string | null }).tokenImg ?? null)
  return place(spots(x, y, stats.size, opts).map(s => ({
    ...s, ref: { kind: 'rules', rulesId, adjustment } as ActorRef, size: stats.size, hp, ac: stats.ac, image,
    initiative: opts.rollInitiative ? initiativeFor({ hp, ac: stats.ac }, entry, adjustment) : null,
  })), opts)
}

/** Places a library token. `unlinked` is true for a bare token, so the page can offer a stat block. */
export async function placeActor(actorId: string, x: number, y: number, opts: PlaceOptions = {}): Promise<{ token: Token | null; unlinked: boolean }> {
  const actor = await actors.get(actorId)
  if (!actor) return { token: null, unlinked: false }
  const link = statLinkOf(actor)
  const stats = tokenStats(link ? await rulesGet(link.rulesId).catch(() => undefined) : undefined, link?.adjustment ?? null)
  const [token] = await place(spots(x, y, stats.size, opts).map(s => ({
    ...s, actorId, ref: actor.ref, statBlock: actor.statBlock, size: stats.size, hp: { current: stats.hpMax, max: stats.hpMax, temp: 0 }, ac: stats.ac,
    playerToken: actor.ref.kind === 'character' || actor.pinned,
  })), opts)
  return { token: token ?? null, unlinked: actor.ref.kind === 'none' && !actor.pinned }
}

export interface BlankToken { label: string; hpMax: number | null; ac: number | null; size: number; initiativeModifier: number }

/** Places tokens typed in by hand, numbered when there are several. */
export async function placeBlank(input: BlankToken, x: number, y: number, opts: PlaceOptions = {}): Promise<Token[]> {
  const size = Math.max(1, Math.floor(input.size) || 1), label = input.label.trim() || 'Token'
  const hp = { current: input.hpMax, max: input.hpMax, temp: 0 }
  const at = spots(x, y, size, opts)
  return place(at.map((s, i) => ({
    ...s, size, hp, ac: input.ac, label: at.length > 1 ? `${label} ${i + 1}` : label,
    initiative: opts.rollInitiative ? initiativeFor({ hp, ac: input.ac }, undefined, null, input.initiativeModifier) : null,
  })), opts)
}

/** Gives a placed token a stat block (or another, or weak/elite) with its HP, AC and size. Damage already taken carries over. */
export async function setStatBlock(id: string, rulesId: string | null, adjustment: Adjustment | null = null): Promise<void> {
  const t = getToken(id)
  if (!t) return
  const entry = rulesId ? await rulesGet(rulesId) : undefined
  const own = t.ref.kind === 'rules' || t.ref.kind === 'none'
  if (!entry || !rulesId) { saveToken(id, own ? { ref: { kind: 'none' } } : { statBlock: null }); await refreshTokens(); return }
  const stats = tokenStats(entry, adjustment)
  const taken = t.hp.max !== null && t.hp.current !== null ? t.hp.max - t.hp.current : 0
  const patch: CombatantPatch = own ? { ref: { kind: 'rules', rulesId, adjustment } } : { statBlock: { rulesId, adjustment } }
  patch.size = stats.size
  if (stats.hpMax !== null) patch.hp = { current: Math.max(0, stats.hpMax - taken), max: stats.hpMax, temp: t.hp.temp }
  if (stats.ac !== null) patch.ac = stats.ac
  // A change of stats, not damage or healing: kept out of the log
  await patchCombatant(id, patch).catch(fail('Linking the stat block'))
  await refreshTokens()
}

/** Rolls initiative for one token, replacing what it had. */
export function rollInitiativeFor(id: string): Promise<void> {
  return rollInitiativeOf(live.tokens.filter(t => t.id === id))
}

/** Rolls initiative for every token that has none. */
export function rollAllInitiative(): Promise<void> {
  return rollInitiativeOf(live.tokens.filter(t => t.initiative === null))
}

async function rollInitiativeOf(todo: Token[]): Promise<void> {
  const entries = new Map((await rulesGetMany([...new Set(todo.map(t => statLinkOf(t)?.rulesId).filter((id): id is string => !!id))])).map(e => [e.id, e]))
  for (const t of todo) {
    const link = statLinkOf(t)
    t.initiative = initiativeFor(t, link ? entries.get(link.rulesId) : undefined, link?.adjustment ?? null, initiativeModifier.of(t))
    saveToken(t.id, { initiative: t.initiative })
  }
}
