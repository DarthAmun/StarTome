/**
 * Rolls from a stat block while an encounter is open: an attack is rolled
 * against the chosen target's AC, its damage can be applied to that target,
 * and both are written to the combat log under the token that is selected.
 */
import { GAME_RULES } from '@/domain/rules/registry'
import { ATTACK_LABEL, rollCheck, rollStrikeDamage, twoHandFormula } from '@/domain/rules/rolls'
import type { RollAction, StatRoll } from '@/domain/rules/statRolls'
import type { Strike } from '@/domain/rules/types'
import type { Token } from '@/data/encounters'
import { showRoll, type RollContext } from '@/ui/dice'
import { applyDamage, getToken, live, logLine } from './live'
import { startArea } from './tools'
import { ref } from 'vue'

/** Whom the selected token's attacks are rolled against. */
export const targetId = ref<string | null>(null)
const signedMod = (n: number) => `${n < 0 ? '−' : '+'} ${Math.abs(n)}`

function apply(id: string, amount: number, critical: boolean): string {
  const t = getToken(id)
  if (amount > 0) applyDamage(id, amount, { critical })
  return `Applied ${amount} to ${t?.name ?? 'the target'}`
}

function rollDamage(label: string, strike: Strike, critical: boolean, twoHand: boolean, source: Token | undefined, t: Token | undefined): string {
  const d = rollStrikeDamage(strike, critical, Math.random, GAME_RULES[live.game].critTraits, { twoHand })
  const how = [twoHand ? 'two-handed' : '', critical ? 'critical' : ''].filter(Boolean).join(', ')
  const full = how && !label.includes(`(${how})`) ? `${label} (${how})` : label
  if (source) logLine(source, 'roll', { note: full, value: d.total, ...(t ? { targetName: t.name } : {}) })
  const actions: RollAction[] = t
    ? [
        { label: `Apply ${d.total}`, primary: true, title: `Damage ${t.name}`, run: () => apply(t.id, d.total, critical) },
        { label: '½', title: 'Apply half (rounded down)', run: () => apply(t.id, Math.floor(d.total / 2), critical) },
        { label: '×2', title: 'Apply double', run: () => apply(t.id, d.total * 2, critical) },
      ]
    : []
  showRoll({
    label: full, total: d.total, breakdown: d.parts.map(p => `${p.breakdown} ${p.type}`).join(' + '),
    outcome: critical ? 'Critical' : undefined, tone: critical ? 'critical-success' : undefined,
    detail: [t ? `vs ${t.name}` : '', ...d.notes].filter(Boolean).join(' · ') || undefined, actions,
  })
  return `${how ? `${how.charAt(0).toUpperCase()}${how.slice(1)} damage` : 'Damage'}: ${d.total}`
}

function roll(r: StatRoll): void {
  const source = getToken(live.selectedId)
  const t = targetId.value && targetId.value !== source?.id ? getToken(targetId.value) : undefined
  if (r.kind === 'damage') { rollDamage(r.label, r.strike, !!r.critical, !!r.twoHand, source, t); return }
  const attack = r.kind === 'attack'
  const c = rollCheck(r.modifier, attack ? t?.ac ?? null : null)
  if (source) logLine(source, 'roll', { note: r.label, value: c.total, ...(c.degree ? { degree: c.degree } : {}), ...(attack && t ? { targetName: t.name } : {}), ...(attack ? { attack: true } : {}) })
  const actions: RollAction[] = []
  // After an attack: its damage, doubled on a critical hit, against the same target
  if (attack && r.strike && c.degree !== 'failure' && c.degree !== 'critical-failure') {
    const strike = r.strike, critical = c.degree === 'critical-success'
    const base = `${r.label.replace(/ \((2nd|3rd) attack\)$/, '')} damage`
    actions.push({ label: critical ? 'Critical damage' : 'Damage', primary: true, run: () => rollDamage(base, strike, critical, false, source, t) })
    if (twoHandFormula(strike)) actions.push({ label: critical ? 'Critical, two-handed' : 'Two-handed', title: 'Damage wielded in two hands', run: () => rollDamage(base, strike, critical, true, source, t) })
  }
  showRoll({
    label: r.label, total: c.total, breakdown: `d20 [${c.d20}] ${signedMod(r.modifier)}`, isCrit: c.d20 === 20, isFail: c.d20 === 1,
    outcome: c.degree ? ATTACK_LABEL[c.degree] : undefined, tone: c.degree ?? undefined,
    detail: t && attack ? `vs ${t.name}${t.ac !== null ? ` (AC ${t.ac})` : ''}` : undefined, actions,
  })
}

export const encounterRolls: RollContext = { roll, placeArea: spec => startArea(spec, live.selectedId) }
