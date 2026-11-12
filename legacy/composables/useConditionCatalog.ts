/**
 * Conditions offered by the VTT: the synced compendium entries of the
 * campaign's game, topped up by the built-in remaster list (attitudes,
 * detection states and anything a partial sync left out). The built-in
 * catalog still provides the icons, colours and one-line reminders.
 */
import { rulesFindByName, rulesQuery, rulesUpdate } from '~/composables/useRules'
import { CONDITION_ALIASES, builtinConditions, conditionInfo, getConditionColor } from '~/composables/useConditions'
import type { GameId } from '~/types/game'
import type { Condition } from '~/types/rules'

export interface AvailableCondition {
  name: string
  summary: string
  hasValue: boolean
  color: string
  icon?: string
  /** Compendium entry, when the condition is synced (or user-made); styles are saved on it. */
  rulesId?: string
}

/** First sentence of a markdown text, without markup — a fallback reminder line. */
export function firstSentence(markdown: string): string {
  const text = markdown
    .replace(/^>\s*\[![^\]]*\].*$/gm, '')
    .replace(/\{\{[^:}]+:\s*([^}|]+)(?:\|[^}]*)?\}\}/g, '$1')
    .replace(/[*_`#>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const m = text.match(/^.{1,200}?[.!?](?=\s|$)/)
  return m ? m[0] : text.slice(0, 200)
}

export async function loadAvailableConditions(game: GameId): Promise<AvailableCondition[]> {
  const synced = (await rulesQuery({ kind: 'condition', games: [game], limit: 500 })).items as Condition[]
  const out = new Map<string, AvailableCondition>()
  for (const e of synced) {
    const cat = conditionInfo(e.name)
    out.set(e.name.toLowerCase(), {
      name: e.name,
      summary: cat?.desc ?? firstSentence(e.description),
      hasValue: e.valued || !!cat?.valued,
      color: e.style?.color ?? cat?.color ?? getConditionColor(e.name),
      icon: e.style?.icon ?? cat?.icon,
      rulesId: e.id,
    })
  }
  for (const c of builtinConditions(game)) {
    if (!out.has(c.name.toLowerCase())) out.set(c.name.toLowerCase(), { name: c.name, summary: c.desc, hasValue: c.valued, color: c.color, icon: c.icon })
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The compendium entry for a condition name; pre-remaster names follow their alias. */
export async function findConditionEntry(name: string, game: GameId): Promise<Condition | undefined> {
  const canonical = CONDITION_ALIASES[name] ?? name
  return (await rulesFindByName('condition', canonical, game)) as Condition | undefined
}

export async function saveConditionStyle(rulesId: string, style: { color?: string; icon?: string }): Promise<void> {
  await rulesUpdate(rulesId, 'style', style)
}
