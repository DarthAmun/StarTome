/** Display formatting for rules values. Pure functions, no game state. */
import type { GameId } from '~/types/game'
import type { ActionCost, BulkTenths, Money, Proficiency, Rarity, Size } from '~/types/rules'

const NUM = new Intl.NumberFormat('en-US')

/**
 * PF2e: gp/sp/cp, largest unit first, no pp (books price in gp above 10 gp).
 * SF2e: credits.
 */
export function formatMoney(money: Money | null | undefined, game: GameId | 'both' = 'pf2e'): string {
  if (!money) return '—'
  const cp = Math.max(0, Math.round(money.cp))
  if (game === 'sf2e') {
    const credits = cp / 10
    return `${NUM.format(Number.isInteger(credits) ? credits : Math.round(credits * 10) / 10)} cr`
  }
  if (cp === 0) return '0 gp'
  const gp = Math.floor(cp / 100)
  const sp = Math.floor((cp % 100) / 10)
  const c = cp % 10
  return [gp && `${NUM.format(gp)} gp`, sp && `${sp} sp`, c && `${c} cp`].filter(Boolean).join(' ')
}

/** Coins entered per denomination → copper. */
export function coinsToCp(coins: Partial<Record<'pp' | 'gp' | 'sp' | 'cp' | 'credits', number>>): number {
  return Math.round(
    (coins.pp ?? 0) * 1000 + (coins.gp ?? 0) * 100 + (coins.sp ?? 0) * 10 + (coins.cp ?? 0) + (coins.credits ?? 0) * 10,
  )
}

/**
 * Parses typed money: '12 gp 5 sp', '3,500 cr', '2pp', or a bare number, read
 * as gp in PF2e and credits in SF2e. Returns cp, or null if unparsable.
 */
export function parseMoney(text: string, game: GameId = 'pf2e'): number | null {
  const t = text.trim().toLowerCase().replace(/,/g, '')
  if (!t) return null
  if (/^-?\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * (game === 'sf2e' ? 10 : 100))
  const unit: Record<string, number> = { pp: 1000, gp: 100, sp: 10, cp: 1, cr: 10, credit: 10, credits: 10 }
  let cp = 0
  let rest = t
  for (const m of t.matchAll(/(-?\d+(?:\.\d+)?)\s*(credits|credit|pp|gp|sp|cp|cr)(?![a-z])/g)) {
    cp += Number(m[1]) * unit[m[2]]
    rest = rest.replace(m[0], '')
  }
  if (rest.trim()) return null
  return Math.round(cp)
}

/** '—' for 0, 'L' for light, '2' or '2 L'-style for mixed; null = varies. */
export function formatBulk(bulk: BulkTenths | undefined, note?: string): string {
  if (bulk === null || bulk === undefined) return note || 'varies'
  if (bulk <= 0) return '—'
  const whole = Math.floor(bulk / 10)
  const light = bulk % 10
  if (!whole) return light === 1 ? 'L' : `${light}L`
  return light ? `${whole}, ${light === 1 ? 'L' : `${light}L`}` : String(whole)
}

/** Parses the usual written forms: '—', '-', 'L', '2', '2L'. Returns undefined if unparsable. */
export function parseBulk(text: string): BulkTenths | undefined {
  const t = text.trim()
  if (!t || /^[—–-]$/.test(t)) return 0
  if (/^l$/i.test(t)) return 1
  const m = t.match(/^(\d+)\s*(l)?$/i)
  if (!m) return undefined
  return m[2] ? Number(m[1]) : Number(m[1]) * 10
}

export const ACTION_GLYPH = { 1: '◆', 2: '◆◆', 3: '◆◆◆', free: '◇', reaction: '↺' } as const

export function formatActionCost(cost: ActionCost | undefined): string {
  if (cost === null || cost === undefined || cost === 'passive') return ''
  if (typeof cost === 'number' || cost === 'free' || cost === 'reaction') return ACTION_GLYPH[cost]
  if ('text' in cost) return cost.text
  return `${ACTION_GLYPH[cost.min]} to ${ACTION_GLYPH[cost.max]}`
}

/** Parses glyphs and words ('◆◆', 'two', '2', 'reaction', 'free', '10 minutes'). */
export function parseActionCost(text: string | null | undefined): ActionCost {
  const t = (text ?? '').trim().toLowerCase()
  if (!t || t === '—' || t === 'passive') return null
  const words: Record<string, ActionCost> = {
    '1': 1, one: 1, '◆': 1, a: 1, '2': 2, two: 2, '◆◆': 2, d: 2, '3': 3, three: 3, '◆◆◆': 3, t: 3,
    free: 'free', '◇': 'free', f: 'free', reaction: 'reaction', '↺': 'reaction', r: 'reaction',
  }
  if (t in words) return words[t]
  const range = t.match(/^(◆{1,3}|[123])\s*(?:to|-|–)\s*(◆{1,3}|[123])$/)
  if (range) {
    const n = (s: string) => (s.startsWith('◆') ? s.length : Number(s)) as 1 | 2 | 3
    return { min: n(range[1]), max: n(range[2]) }
  }
  return { text: text!.trim() }
}

export const SIZE_LABEL: Record<Size, string> = { tiny: 'Tiny', sm: 'Small', med: 'Medium', lg: 'Large', huge: 'Huge', grg: 'Gargantuan' }

/** Grid squares a creature of this size occupies per side (Tiny shares a square). */
export const SIZE_SQUARES: Record<Size, number> = { tiny: 1, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 }

export const RARITY_COLOR: Record<Rarity, string> = {
  common: 'var(--text3)',
  uncommon: '#e07a2e',   // Paizo's trait colours, lightened for the dark themes
  rare: '#4a7fe0',
  unique: '#a05ad4',
}

export const PROFICIENCIES: Proficiency[] = ['untrained', 'trained', 'expert', 'master', 'legendary']

export function signed(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`
}

/** 'versatile-p' → 'versatile P', 'deadly-d10' → 'deadly d10', 'reach-15' → 'reach 15'. */
export function formatTrait(slug: string): string {
  const m = slug.match(/^(.*?)-((?:d\d+)|\d+|[a-z])$/i)
  if (m && /^(versatile|deadly|fatal|reach|thrown|volley|range|reload|two-hand|jousting|scatter|modular|capacity|kickback|concussive)/.test(m[1])) {
    return `${m[1].replace(/-/g, ' ')} ${m[2].length === 1 ? m[2].toUpperCase() : m[2]}`
  }
  return slug.replace(/-/g, ' ')
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}
