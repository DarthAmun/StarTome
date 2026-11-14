/**
 * Linked players in the open encounter (Play Buddy): their tokens follow the
 * HP, conditions and AC their app reports, their initiative rolls land in the
 * turn order, their rolls in the log, and damage dealt to them here is sent
 * to their app, which applies its own resistances.
 */
import { shallowRef } from 'vue'
import { onDomainEvent } from '@/domain/events'
import { conditionInfo, type TokenCondition } from '@/domain/rules/conditions'
import type { Character, Mirror } from '@/domain/schema'
import { patchCombatant, type CombatantPatch, type Token } from '@/data/encounters'
import { isTokenOf } from '@/data/link'
import { partyOf } from '@/data/party'
import { requestDamage, requestInitiative } from '@/services/characterLink/link'
import { notify, reportError } from '@/ui/dialogs'
import { damageHooks, initiativeModifier, live, logLine } from './live'

/** The campaign's linked party members. */
export const linkedParty = shallowRef<Character[]>([])

export const characterOfToken = (t: Token): Character | undefined => linkedParty.value.find(c => isTokenOf(t, c))
export const sharedOf = (t: Token): Mirror | null => characterOfToken(t)?.link?.mirror ?? null
/** Linked party members who have a token in this encounter. */
export const linkedHere = (): Character[] => linkedParty.value.filter(c => live.tokens.some(t => isTokenOf(t, c)))

function conditionsFrom(m: NonNullable<Mirror['basic']>, before: TokenCondition[]): TokenCondition[] {
  return m.conditions.map((c) => {
    const old = before.find(o => o.name.toLowerCase() === c.name.toLowerCase())
    const info = conditionInfo(c.name)
    return { ...(info ? { color: info.color, icon: info.icon } : {}), ...old, name: old?.name ?? c.name, value: c.value }
  })
}

/** Brings the character's tokens in step with what their player shares. */
function follow(c: Character): void {
  const m = c.link?.mirror
  if (!m) return
  for (const t of live.tokens.filter(x => isTokenOf(x, c))) {
    const patch: CombatantPatch = {}
    if (m.basic) {
      const hp = { current: m.basic.hp.value, max: m.basic.hp.max, temp: m.basic.hp.temp }
      if (hp.current !== t.hp.current || hp.max !== t.hp.max || hp.temp !== t.hp.temp) {
        const diff = t.hp.current === null ? 0 : hp.current - t.hp.current
        if (live.encounter?.status === 'active' && diff) logLine(t, diff < 0 ? 'damage' : 'healing', { value: Math.abs(diff), note: 'in their app' })
        patch.hp = hp
      }
      const conditions = conditionsFrom(m.basic, t.conditions)
      if (JSON.stringify(conditions.map(k => [k.name, k.value])) !== JSON.stringify(t.conditions.map(k => [k.name, k.value]))) patch.conditions = conditions
    }
    if (m.defenses && m.defenses.ac !== t.ac) patch.ac = m.defenses.ac
    if (!Object.keys(patch).length) continue
    Object.assign(t, patch)
    patchCombatant(t.id, patch).catch(err => reportError('Saving the token', err))
  }
}

async function reload(): Promise<void> {
  linkedParty.value = live.encounter ? (await partyOf(live.encounter.campaignId)).filter(c => c.link) : []
}

/** Asks every linked player with a token here to roll initiative in their app. */
export async function askInitiative(): Promise<void> {
  const enc = live.encounter
  if (!enc) return
  const check = /stealth/i.test(enc.initiativeFormula ?? '') ? 'skill:stealth' : 'perception'
  const n = await requestInitiative(enc.id, linkedHere(), check, `Initiative — ${enc.name}`).catch((err) => { reportError('Asking for initiative', err); return 0 })
  if (n) notify(`Asked ${n} ${n === 1 ? 'player' : 'players'} to roll initiative.`, 'ok')
}

/** Call when an encounter has loaded; returns what to call when its page is left. */
export async function startLinkLive(): Promise<() => void> {
  await reload()
  for (const c of linkedParty.value) follow(c)
  initiativeModifier.of = t => sharedOf(t)?.defenses?.perception ?? 0
  const sendDamage = (t: Token, amount: number) => {
    const c = characterOfToken(t)
    if (c && live.encounter?.status === 'active') requestDamage(c, { damage: [{ amount, type: 'untyped' }], conditions: [], label: live.encounter.name }).catch(err => reportError('Sending the damage', err))
  }
  damageHooks.push(sendDamage)
  const stops = [
    onDomainEvent('characterMirrored', async ({ campaignId, characterId }) => {
      if (live.encounter?.campaignId !== campaignId) return
      await reload()
      const c = linkedParty.value.find(x => x.id === characterId)
      if (c) follow(c)
    }),
    onDomainEvent('linkInitiative', ({ encounterId, characterId, total }) => {
      const c = linkedParty.value.find(x => x.id === characterId)
      if (!c || live.encounter?.id !== encounterId) return
      for (const t of live.tokens.filter(x => isTokenOf(x, c))) t.initiative = total
    }),
    onDomainEvent('linkRoll', ({ campaignId, characterId, line }) => {
      const c = linkedParty.value.find(x => x.id === characterId)
      const t = c && live.encounter?.campaignId === campaignId && live.encounter.status === 'active' ? live.tokens.find(x => isTokenOf(x, c)) : undefined
      if (t) logLine(t, 'note', { note: line })
    }),
  ]
  return () => {
    for (const stop of stops) stop()
    damageHooks.splice(damageHooks.indexOf(sendDamage), 1)
    initiativeModifier.of = () => 0
  }
}
