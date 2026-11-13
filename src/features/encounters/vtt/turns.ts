/**
 * The turn order of the open encounter: who acts when, what a turn change
 * does by itself (timers, frightened and stunned, recovery and persistent
 * damage prompts), and taking exactly that back when stepping a turn back.
 */
import { computed, watch } from 'vue'
import { damageWithTemp } from '@/domain/rules/hp'
import { endOfTurn, hpChangeEffects, persistentCheck, recoveryCheck, revertChanges, startOfTurn, type ConditionChange, type Degree, type EffectResult } from '@/domain/rules/turnEffects'
import { patchCombatant, type CombatantPatch, type Token } from '@/data/encounters'
import { reportError } from '@/ui/dialogs'
import { dropLog, getToken, live, logChanges, logLine, saveEncounter, usesDying, type TurnPrompt } from './live'

/** What one turn change did by itself, so stepping back undoes exactly that. Lives as long as the page. */
interface TurnRecord {
  tokenId: string | null
  timerTokenId: string | null
  timerIds: string[]
  logIds: string[]
  effects: { tokenId: string; changes: ConditionChange[]; hpDelta: number; tempDelta: number; died: boolean }[]
  promptIds: number[]
}
const history: TurnRecord[] = []
let nextPromptId = 1

const save = (id: string, patch: CombatantPatch) => patchCombatant(id, patch).catch(err => reportError('Saving the token', err))

/** Who takes turns: alive and visible (or hidden but still acting), highest initiative first, unrolled last. */
export const order = computed<Token[]>(() => live.tokens
  .filter(t => (t.visible || t.actsWhileHidden) && !t.dead && !(t.sensor?.role === 'player-ship' && t.initiative === null))
  .sort((a, b) => (a.initiative === null ? (b.initiative === null ? 0 : 1) : b.initiative === null ? -1 : b.initiative - a.initiative)))

export const turnIndex = computed(() => Math.max(0, order.value.findIndex(t => t.id === live.activeId)))
export const round = computed(() => live.encounter?.turn.round ?? 1)

// When the acting token leaves the order (hidden, removed, killed), the turn passes to whoever now stands in its place
watch(order, (now, before) => {
  if (live.activeId === null || now.some(t => t.id === live.activeId)) return
  const was = before.findIndex(t => t.id === live.activeId)
  live.activeId = now[Math.min(Math.max(0, was), now.length - 1)]?.id ?? null
}, { flush: 'sync' })

/** After loading: the stored index names the acting token. */
export function restoreTurn(): void {
  history.length = 0
  live.activeId = order.value[live.encounter?.turn.index ?? 0]?.id ?? null
}

function persistTurn(roundNumber: number): void {
  saveEncounter({ turn: { index: turnIndex.value, round: roundNumber } })
}

/** A token joining mid-fight with a higher initiative must not take over the turn of whoever is acting. */
export function keepTurn(): void {
  if (live.activeId === null && order.value.length && live.encounter?.status === 'active') live.activeId = order.value[turnIndex.value]?.id ?? null
}

export function startEncounter(): void {
  if (!live.encounter) return
  saveEncounter({ status: 'active' })
  if (!live.activeId) live.activeId = order.value[0]?.id ?? null
  persistTurn(round.value)
}

/** Applies a result to the token, logs it as automatic and records it for undo. */
function applyEffects(token: Token, fx: EffectResult, record: TurnRecord | null, hpDelta = 0, tempDelta = 0): void {
  if (fx.changes.length) { token.conditions = fx.conditions; void save(token.id, { conditions: fx.conditions }) }
  const logIds = logChanges(token, fx.changes)
  const died = fx.dead && !token.dead
  if (died) {
    token.dead = true
    void save(token.id, { dead: true })
    const id = logLine(token, 'death', { auto: true })
    if (id) logIds.push(id)
  }
  for (const seed of fx.prompts) {
    const prompt: TurnPrompt = { ...seed, id: nextPromptId++, tokenId: token.id, tokenName: token.name }
    live.turnPrompts = [...live.turnPrompts, prompt]
    record?.promptIds.push(prompt.id)
  }
  if (!record) return
  record.logIds.push(...logIds)
  if (fx.changes.length || died || hpDelta || tempDelta) record.effects.push({ tokenId: token.id, changes: fx.changes, hpDelta, tempDelta, died })
}

/** Start of the token's turn: its running timers count down by one. */
function tickTimers(token: Token | undefined, record: TurnRecord): void {
  if (!token?.timers.length) return
  record.timerTokenId = token.id
  token.timers = token.timers.map((t) => {
    if (t.remaining <= 0) return t
    record.timerIds.push(t.id)
    if (t.remaining === 1) { const id = logLine(token, 'timer-up', { note: t.name }); if (id) record.logIds.push(id) }
    return { ...t, remaining: t.remaining - 1 }
  })
  if (record.timerIds.length) void save(token.id, { timers: token.timers })
}

/** Hooks for areas: a new round, and a token ending or starting its turn. */
export const turnHooks = { newRound: (_round: number) => {}, turnEnd: (_t: Token) => {}, turnStart: (_t: Token) => {} }

export function nextTurn(): void {
  const list = order.value
  if (!list.length || !live.encounter) return
  const idx = turnIndex.value, ending = list[idx]
  let roundNumber = round.value
  if (idx + 1 >= list.length) { live.activeId = list[0]?.id ?? null; roundNumber++; turnHooks.newRound(roundNumber) }
  else live.activeId = list[idx + 1]?.id ?? null
  const record: TurnRecord = { tokenId: live.activeId, timerTokenId: null, timerIds: [], logIds: [], effects: [], promptIds: [] }
  if (ending) applyEffects(ending, endOfTurn(ending.conditions, live.automation), record)
  const starting = getToken(live.activeId)
  tickTimers(starting, record)
  live.turnNotes = []
  if (starting) {
    const fx = startOfTurn(starting.conditions, live.automation, usesDying(starting))
    applyEffects(starting, fx, record)
    live.turnNotes = fx.notes.map(text => ({ tokenId: starting.id, text }))
  }
  if (ending) turnHooks.turnEnd(ending)
  if (starting) turnHooks.turnStart(starting)
  history.push(record)
  if (history.length > 200) history.shift()
  persistTurn(roundNumber)
}

export function prevTurn(): void {
  const list = order.value, idx = turnIndex.value
  if (!list.length || (idx === 0 && round.value <= 1)) return
  undoTurn(live.activeId)
  live.turnNotes = []
  let roundNumber = round.value
  if (idx === 0) { roundNumber--; live.activeId = list[list.length - 1]?.id ?? null }
  else live.activeId = list[idx - 1]?.id ?? null
  persistTurn(roundNumber)
}

function undoTurn(tokenId: string | null): void {
  const last = history[history.length - 1]
  if (!last || last.tokenId !== tokenId) return
  history.pop()
  if (last.promptIds.length) live.turnPrompts = live.turnPrompts.filter(p => !last.promptIds.includes(p.id))
  for (const fx of [...last.effects].reverse()) {
    const t = getToken(fx.tokenId)
    if (!t) continue
    const patch: CombatantPatch = {}
    if (fx.changes.length) patch.conditions = t.conditions = revertChanges(t.conditions, fx.changes)
    if ((fx.hpDelta || fx.tempDelta) && t.hp.current !== null) {
      patch.hp = t.hp = { ...t.hp, current: Math.max(0, Math.min(t.hp.max ?? Infinity, t.hp.current - fx.hpDelta)), temp: Math.max(0, t.hp.temp - fx.tempDelta) }
    }
    if (fx.died) patch.dead = t.dead = false
    void save(t.id, patch)
  }
  dropLog(last.logIds)
  const t = getToken(last.timerTokenId)
  if (!t || !last.timerIds.length) return
  t.timers = t.timers.map(x => (last.timerIds.includes(x.id) ? { ...x, remaining: Math.min(x.duration, x.remaining + 1) } : x))
  void save(t.id, { timers: t.timers })
}

// ── Prompts ────────────────────────────────────────────────────────────────

function take(promptId: number): TurnPrompt | undefined {
  const prompt = live.turnPrompts.find(p => p.id === promptId)
  live.turnPrompts = live.turnPrompts.filter(p => p.id !== promptId)
  return prompt
}
/** The turn that raised a prompt, so its result is undone with that turn. */
const recordOf = (promptId: number) => history.find(r => r.promptIds.includes(promptId)) ?? null

export function dismissPrompt(promptId: number): void { take(promptId) }

export function resolveRecovery(promptId: number, degree: Degree): void {
  const prompt = take(promptId), token = getToken(prompt?.tokenId)
  if (!token) return
  const record = recordOf(promptId)
  const id = logLine(token, 'note', { auto: true, note: `Recovery check: ${degree.replace('-', ' ')}` })
  if (record && id) record.logIds.push(id)
  applyEffects(token, recoveryCheck(token.conditions, degree), record)
}

/** The damage taken (0 for none) and whether the flat check ended the condition. */
export function resolvePersistent(promptId: number, damage: number, recovered: boolean): void {
  const prompt = take(promptId), token = getToken(prompt?.tokenId)
  if (!token || prompt?.kind !== 'persistent') return
  const record = recordOf(promptId)
  if (damage > 0 && token.hp.current !== null) {
    const from = token.hp.current
    const r = damageWithTemp({ hp: from, temp: token.hp.temp }, damage)
    const id = logLine(token, 'damage', { value: damage, auto: true, conditionName: prompt.condition, ...(r.absorbed ? { absorbed: r.absorbed } : {}) })
    if (id) record?.logIds.push(id)
    token.hp = { ...token.hp, current: r.hp, temp: r.temp }
    void save(token.id, { hp: token.hp })
    const fx = hpChangeEffects(token.conditions, { from, to: r.hp, hitsAtZero: from <= 0 && damage > r.absorbed ? 1 : 0 }, usesDying(token), live.automation)
    applyEffects(token, fx, record, r.hp - from, -r.absorbed)
  }
  applyEffects(token, persistentCheck(token.conditions, prompt.condition, recovered), record)
}

// ── Timers ─────────────────────────────────────────────────────────────────

export function setTimers(token: Token, timers: Token['timers']): void {
  token.timers = timers
  void save(token.id, { timers })
}

export function addTimer(token: Token, name: string, turns: number, visibleToPlayers = false): void {
  if (!name.trim() || turns < 1) return
  setTimers(token, [...token.timers, { id: `tmr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), remaining: turns, duration: turns, visibleToPlayers }])
}
