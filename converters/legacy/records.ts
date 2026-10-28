/**
 * Legacy DM's Tome record → 'legacy' compendium entry (FORK_PLAN.md §8.2).
 *
 * Only for records the user keeps although no synced entry matches them
 * (homebrew, or content Foundry doesn't ship). The records come from a
 * pf2etools-derived library; its quirks are fixed here: size and alignment in
 * the traits, strikes inside the abilities text, Python-repr deity weapons,
 * placeholder zeros and {@tag} markup. Pure: no database, no DOM.
 */
import { parseActionCost, parseBulk } from '~/rules/format'
import { parseIwr, parseSenses, parseSpellList, splitList } from '~/rules/parse'
import type {
  AbilityKey, ActionCost, Creature, DamageRoll, Feat, Hazard, Item, ItemCategory, Rarity, ReferenceEntry, RulesEntity,
  RulesKind, Size, Spell, StatAction, Strike,
} from '~/types/rules'
import { isRemasterSource, legacySourceTitle } from './match'

export interface LegacyRecord {
  id: number
  entityTypeId: string
  name: string
  data: string | Record<string, any>
}

export const LEGACY_KINDS = new Set<RulesKind>([
  'item', 'creature', 'hazard', 'spell', 'feat', 'condition', 'ancestry', 'background', 'class', 'deity',
])

export function legacyKindOf(entityTypeId: string): RulesKind | null {
  return LEGACY_KINDS.has(entityTypeId as RulesKind) ? entityTypeId as RulesKind : null
}

export function recordData(rec: LegacyRecord): Record<string, any> {
  if (typeof rec.data !== 'string') return rec.data ?? {}
  try { return JSON.parse(rec.data) } catch { return {} }
}

/** The record's level as the matcher sees it (spell rank, feat level, cantrip = 1). */
export function legacyLevel(kind: RulesKind, d: Record<string, any>): number | null {
  const raw = kind === 'spell' ? d.spellLevel : kind === 'feat' ? d.featLevel : d.level
  if (kind === 'spell' && /cantrip/i.test(String(raw))) return 1
  const n = Number(raw)
  return Number.isFinite(n) && raw !== '' && raw !== null && raw !== undefined ? n : null
}

/** Image data URL the user attached (creature portrait, item/ancestry/class/deity image). */
export function recordImage(d: Record<string, any>): string | null {
  const v = d.portrait || d.image
  return typeof v === 'string' && v.startsWith('data:image/') ? v : null
}

// ── Text ───────────────────────────────────────────────────────────────────

const TAG_KINDS: Record<string, RulesKind> = {
  spell: 'spell', item: 'item', condition: 'condition', creature: 'creature', feat: 'feat', action: 'action',
  hazard: 'hazard', deity: 'deity', ancestry: 'ancestry', background: 'background', class: 'class', heritage: 'heritage',
}

/** pf2etools markup: {@spell fireball|CRB} → {{spell: fireball}}, {@as 2} → ◆◆, {@dc 18} → DC 18. */
export function legacyText(s: unknown): string {
  if (typeof s !== 'string') return ''
  return s.replace(/\{@(\w+)\s([^}]*)\}/g, (_m, tag: string, body: string) => {
    const [name, , display] = body.split('|').map(p => p.trim())
    if (tag === 'as') return ({ 1: '◆', 2: '◆◆', 3: '◆◆◆', f: '◇', r: '↺', free: '◇', reaction: '↺' } as Record<string, string>)[name.toLowerCase()] ?? name
    if (tag === 'dc') return `DC ${name}`
    const kind = TAG_KINDS[tag]
    if (kind) return `{{${kind}: ${name}}}`
    return display || name
  }).trim()
}

/** "two-hand <d10>" → "two-hand-d10", "reach <10 feet>" → "reach-10", "Fire" → "fire". */
export function traitSlug(t: string): string {
  return t.toLowerCase().replace(/<\s*([^>]*?)\s*(?:feet|ft\.?)?\s*>/g, '-$1').replace(/\s*-\s*/g, '-').trim().replace(/\s+/g, '-')
}

const ALIGNMENT_TRAITS = new Set(['lg', 'ng', 'cg', 'ln', 'n', 'cn', 'le', 'ne', 'ce', 'any alignment'])
const SIZE_TRAITS: Record<string, Size> = { tiny: 'tiny', small: 'sm', medium: 'med', large: 'lg', huge: 'huge', gargantuan: 'grg' }

function traitsOf(list: unknown, drop?: (t: string) => boolean): string[] {
  if (!Array.isArray(list)) return []
  return [...new Set(list.filter((t): t is string => typeof t === 'string' && !!t.trim()).map(traitSlug).filter(t => !drop?.(t)))]
}

function rarityOf(v: unknown): Rarity {
  const r = String(v ?? '').toLowerCase()
  return r === 'uncommon' || r === 'rare' || r === 'unique' ? r : 'common'
}

function costOf(v: unknown): ActionCost {
  return v === null || v === undefined || v === '' ? null : parseActionCost(String(v))
}

/** A positive number, or undefined for the 0 placeholders the old library stored. */
function pos(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function str(v: unknown): string | undefined {
  const s = typeof v === 'string' ? legacyText(v) : ''
  return s || undefined
}

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim())
  if (typeof v === 'string' && v.trim()) return splitList(v)
  return []
}

function joinBlocks(...parts: (string | undefined)[]): string {
  return parts.filter(p => p && p.trim()).join('\n\n')
}

// ── Stat-block text ────────────────────────────────────────────────────────

const DAMAGE_ABBR: Record<string, string> = { B: 'bludgeoning', P: 'piercing', S: 'slashing' }

/** "1d8+4 bludgeoning plus 1d4 persistent fire plus Grab" → rolls + effects. */
export function parseDamage(text: string): { damage: DamageRoll[]; effects: string[] } {
  const damage: DamageRoll[] = []
  const effects: string[] = []
  for (const part of text.split(/\s+plus\s+/i)) {
    const m = part.trim().match(/^(\d+(?:d\d+)?(?:\s*[+−-]\s*\d+)?)\s*(.*)$/)
    if (m) damage.push({ formula: m[1].replace(/\s+/g, '').replace('−', '-'), type: m[2].replace(/\s*damage$/i, '').trim() })
    else if (part.trim()) effects.push(part.trim())
  }
  return { damage, effects }
}

const STRIKE = /^\*\*(.+?)\*\*\s+(Melee|Ranged)\s+([+−-]?\d+)(.*)$/i

/**
 * The abilities text: strikes first ("**fist** Melee +10/+5/+0 to hit (agile)\n  Damage: 1d6+4 bludgeoning"),
 * then "---", then abilities as "**Name** ◆◆ (traits)\ntext" blocks.
 */
export function parseAbilitiesText(text: string): { strikes: Strike[]; actions: StatAction[] } {
  const strikes: Strike[] = []
  const actions: StatAction[] = []
  const blocks = legacyText(text).split(/\n(?=\*\*[^*\n]+\*\*)|\n-{3,}\n/)
  for (const raw of blocks) {
    const block = raw.replace(/^-{3,}\s*/, '').trim()
    if (!block) continue
    const [head, ...rest] = block.split('\n')
    const sm = head.match(STRIKE)
    if (sm) {
      const dmgLine = rest.find(l => /^\s*Damage:/i.test(l))
      const { damage, effects } = parseDamage(dmgLine?.replace(/^\s*Damage:\s*/i, '') ?? '')
      strikes.push({
        name: sm[1].trim(), range: sm[2].toLowerCase() === 'ranged' ? 'ranged' : 'melee', bonus: Number(sm[3].replace('−', '-')),
        traits: splitList(sm[4].match(/\((.*)\)\s*$/)?.[1] ?? '').map(traitSlug), damage, ...(effects.length ? { effects } : {}),
      })
      continue
    }
    const am = head.match(/^\*\*(.+?)\*\*\s*([◆◇↺]+)?\s*(?:\(([^)]*)\))?\s*(.*)$/)
    if (!am) {
      // Text before the first header belongs to the previous ability, or stands alone
      if (actions.length) actions[actions.length - 1].text = joinBlocks(actions[actions.length - 1].text, block)
      else actions.push({ name: 'Notes', cost: null, section: 'interaction', traits: [], text: block })
      continue
    }
    const cost = am[2] ? parseActionCost(am[2]) : null
    const body = joinBlocks(am[4], rest.join('\n').trim())
    actions.push({
      name: am[1].trim(), cost, section: cost === null ? 'defensive' : cost === 'reaction' ? 'defensive' : 'offensive',
      traits: am[3] ? splitList(am[3]).map(traitSlug) : [], text: body,
    })
  }
  return { strikes, actions }
}

/** "__\n**4:** speak with plants\n**0:** detect magic" → "4: speak with plants; cantrips: detect magic" spells. */
function spellsOf(text: unknown) {
  if (typeof text !== 'string' || !text.trim()) return []
  const groups = text.split('\n')
    .map(l => l.replace(/\*\*/g, '').replace(/^_+$/, '').trim())
    .filter(Boolean)
    .map(l => l.replace(/^0\s*:/, 'cantrips:').replace(/\s*×\s*(\d+)/g, ' (×$1)').replace(/\|\w+/g, ''))
  const spells = parseSpellList(groups.join('; '))
  return spells.length ? [{ name: 'Spells', tradition: '', type: 'innate' as const, dc: 0, spells }] : []
}

const ABILITY: Record<string, AbilityKey> = { STR: 'str', DEX: 'dex', CON: 'con', INT: 'int', WIS: 'wis', CHA: 'cha' }

function lowerKeys(o: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries((o && typeof o === 'object') ? o : {})) {
    const n = Number(v)
    if (Number.isFinite(n)) out[k.toLowerCase()] = n
  }
  return out
}

/** "{'weapons': ['falcata|TV']}" → "falcata" */
export function parseFavoredWeapon(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined
  if (!v.trim().startsWith('{')) return v.trim()
  const names = [...v.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(s => s !== 'weapons').map(s => s.split('|')[0])
  return names.join(', ') || undefined
}

// ── Kinds ──────────────────────────────────────────────────────────────────

const ITEM_CATEGORY: Record<string, ItemCategory> = { weapon: 'weapon', armor: 'armor', shield: 'shield', consumable: 'consumable' }

function price(p: any): Item['price'] {
  const amount = Number(p?.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const per: Record<string, number> = { pp: 1000, gp: 100, sp: 10, cp: 1 }
  return { cp: Math.round(amount * (per[p.denomination] ?? 100)) }
}

function bulk(v: unknown): { bulk: Item['bulk']; bulkNote?: string } {
  if (v === undefined || v === null || v === '') return { bulk: 0 }
  const s = String(v).replace('–', '—')
  const b = parseBulk(s === '-' ? '—' : s)
  return b === undefined ? { bulk: null, bulkNote: s } : { bulk: b }
}

function convertItem(d: Record<string, any>): Partial<Item> {
  const category = ITEM_CATEGORY[String(d.itemType ?? '').toLowerCase()] ?? 'equipment'
  const out: Partial<Item> = {
    kind: 'item', category, price: price(d.price), ...bulk(d.bulk),
    usage: str(d.usage), hands: d.hands && d.hands !== '—' ? String(d.hands) : undefined,
    description: joinBlocks(legacyText(d.description), legacyText(d.activation)),
  }
  const dmg = Array.isArray(d.damage) ? d.damage[0] : null
  if (category === 'weapon' && dmg?.dice) {
    const m = String(dmg.dice).match(/^(\d+)d(\d+)$/)
    out.weapon = {
      category: String(d.weaponCategory || 'simple').toLowerCase(), group: str(d.weaponGroup)?.toLowerCase(),
      damage: { dice: m ? Number(m[1]) : 1, die: m ? `d${m[2]}` : String(dmg.dice), type: DAMAGE_ABBR[dmg.type] ?? String(dmg.type ?? '').toLowerCase() },
    }
  }
  if (category === 'armor') {
    out.armor = {
      category: String(d.armorCategory || 'light').toLowerCase(), group: str(d.armorGroup)?.toLowerCase(),
      acBonus: Number(d.acBonus) || 0, dexCap: d.dexCap === null || d.dexCap === undefined || d.dexCap === '' ? null : Number(d.dexCap),
      checkPenalty: Number(d.checkPenalty) || 0, speedPenalty: 0, strength: pos(d.strengthReq) ?? null,
    }
  }
  if (category === 'shield') {
    out.shield = { acBonus: Number(d.shieldAC) || 0, hardness: Number(d.hardness) || 0, hp: Number(d.shieldHP?.max) || 0, bt: Number(d.shieldBT) || 0 }
  }
  return out
}

function convertCreature(d: Record<string, any>): Partial<Creature> {
  const rawTraits: string[] = Array.isArray(d.traits) ? d.traits.map((t: string) => String(t).toLowerCase()) : []
  const sizeTrait = rawTraits.find(t => t in SIZE_TRAITS)
  const size = SIZE_TRAITS[sizeTrait ?? String(d.size ?? '').toLowerCase()] ?? 'med'
  const { strikes, actions } = parseAbilitiesText(String(d.abilities ?? ''))
  const abilities = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } as Record<AbilityKey, number>
  for (const [k, v] of Object.entries<any>(d.abilityScores ?? {})) if (ABILITY[k.toUpperCase()]) abilities[ABILITY[k.toUpperCase()]] = Number(v) || 0
  const saves = d.saves ?? {}
  return {
    kind: 'creature', size,
    traits: traitsOf(d.traits, t => ALIGNMENT_TRAITS.has(t) || t in SIZE_TRAITS),
    perception: Number(d.perception) || 0,
    senses: parseSenses(list(d.senses).join(', ')),
    languages: list(d.languages),
    skills: lowerKeys(d.skills),
    abilities,
    ac: Number(d.ac) || 0,
    saves: { fort: Number(saves.Fortitude) || 0, ref: Number(saves.Reflex) || 0, will: Number(saves.Will) || 0 },
    hp: Number(d.hp?.max ?? d.hp) || 0,
    hardness: pos(d.hardness),
    immunities: list(d.immunities),
    weaknesses: typeof d.weaknesses === 'string' && d.weaknesses.trim() ? parseIwr(d.weaknesses) : [],
    resistances: typeof d.resistances === 'string' && d.resistances.trim() ? parseIwr(d.resistances) : [],
    speeds: lowerKeys(d.speed),
    strikes, actions,
    spellcasting: spellsOf(d.spells),
    inventory: [],
    description: '',
  }
}

function convertHazard(d: Record<string, any>): Partial<Hazard> {
  const stealth = String(d.stealth ?? '').trim()
  const sm = stealth.match(/^\+?(-?\d+)/)
  const note = stealth.replace(/^\+?-?\d+\s*/, '').replace(/^\((.*)\)$/, '$1').trim()
  const { strikes, actions } = parseAbilitiesText(String(d.effect ?? ''))
  // Effect text before the first ability header is the hazard's description
  const lead = actions[0]?.name === 'Notes' ? actions.shift()!.text : ''
  const saves = Object.fromEntries(
    [['fort', d.saves?.Fortitude], ['ref', d.saves?.Reflex], ['will', d.saves?.Will]].filter(([, v]) => pos(v)).map(([k, v]) => [k, Number(v)]),
  )
  return {
    kind: 'hazard',
    complex: /complex/i.test(String(d.complexity ?? '')),
    stealth: { bonus: sm ? Number(sm[1]) : null, ...(note ? { note } : {}) },
    disable: legacyText(d.disable),
    ac: pos(d.ac), saves: Object.keys(saves).length ? saves : undefined,
    hardness: pos(d.hardness), hp: pos(d.hp?.max),
    immunities: list(d.immunities),
    strikes: strikes.length ? strikes : undefined,
    actions,
    routine: str(d.routine), reset: str(d.reset),
    description: lead,
  }
}

const SAVE: Record<string, 'fort' | 'ref' | 'will'> = { fortitude: 'fort', reflex: 'ref', will: 'will' }

function convertSpell(d: Record<string, any>): Partial<Spell> {
  const type = String(d.spellType ?? '').toLowerCase()
  const cantrip = type === 'cantrip' || /cantrip/i.test(String(d.spellLevel))
  const save = String(d.savingThrow ?? '')
  const firstSave = save.toLowerCase().match(/fortitude|reflex|will/)?.[0]
  const cast = costOf(d.cast)
  return {
    kind: 'spell',
    spellType: type === 'focus' ? 'focus' : type === 'ritual' ? 'ritual' : 'spell',
    traits: [...traitsOf(d.traits), ...(cantrip && !traitsOf(d.traits).includes('cantrip') ? ['cantrip'] : [])],
    traditions: list(d.tradition).map(t => t.toLowerCase()),
    cast: cast ?? (d.castNote ? { text: String(d.castNote) } : null),
    range: str(d.range), area: str(d.area), targets: str(d.targets), duration: str(d.duration),
    sustained: /sustained/i.test(String(d.duration ?? '')) || undefined,
    defense: /^ac\b/i.test(save) ? { ac: true } : firstSave ? { save: SAVE[firstSave], basic: /basic/i.test(save) } : null,
    heightened: Array.isArray(d.heightening) && d.heightening.length
      ? d.heightening.map((h: any) => ({ trigger: String(h.trigger ?? ''), text: legacyText(h.effect) }))
      : undefined,
    description: legacyText(d.description),
  }
}

function convertFeat(d: Record<string, any>): Partial<Feat> {
  return {
    kind: 'feat',
    category: String(d.featType || 'general').toLowerCase(),
    cost: costOf(d.actionCost),
    prerequisites: list(d.prerequisites),
    trigger: str(d.trigger), frequency: str(d.frequency), requirements: str(d.requirements),
    description: joinBlocks(legacyText(d.description), d.special ? `**Special** ${legacyText(d.special)}` : undefined),
  }
}

function facts(entries: [string, unknown][]): ReferenceEntry['facts'] {
  const out: ReferenceEntry['facts'] = {}
  for (const [k, v] of entries) {
    if (Array.isArray(v)) { const l = list(v); if (l.length) out[k] = l }
    else if (typeof v === 'number') { if (v) out[k] = v }
    else if (typeof v === 'string' && legacyText(v)) out[k] = legacyText(v)
  }
  return out
}

function convertReference(kind: ReferenceEntry['kind'], d: Record<string, any>): Partial<ReferenceEntry> {
  switch (kind) {
    case 'background':
      return { kind, facts: facts([['boosts', d.abilityBoosts], ['skills', d.skills], ['feat', d.feat], ['lore', d.lore]]), description: legacyText(d.description) }
    case 'ancestry':
      return {
        kind, traits: traitsOf(d.traits),
        facts: facts([['hp', Number(d.hp) || 0], ['size', d.size], ['speed', Number(d.speed) || 0], ['boosts', d.abilityBoosts], ['flaw', d.abilityFlaw], ['languages', d.languages]]),
        description: legacyText(d.features),
      }
    case 'class':
      return {
        kind,
        facts: facts([['key attribute', d.keyAbility], ['hp', Number(d.hp) || 0], ['perception', d.perception], ['fortitude', d.fortitude], ['reflex', d.reflex], ['will', d.will], ['spellcasting', d.spellcasting]]),
        description: joinBlocks(legacyText(d.description), legacyText(d.classFeatures), legacyText(d.subclasses)),
      }
    case 'deity':
      return {
        kind,
        facts: facts([
          ['edicts', d.edicts], ['anathema', d.anathema], ['areas of concern', d.areasOfConcern], ['domains', d.domains],
          ['divine font', d.divineFont], ['divine skill', d.divineSkill], ['favored weapon', parseFavoredWeapon(d.favoredWeapon)],
        ]),
        description: joinBlocks(legacyText(d.description), d.spells ? `**Cleric spells**\n${legacyText(d.spells)}` : undefined),
      }
    default:
      return { kind, facts: {}, description: legacyText(d.description) }
  }
}

/** A kept legacy record as a compendium entry. `id`/timestamps are set by the caller. */
export function convertLegacyRecord(rec: LegacyRecord): Omit<RulesEntity, 'id' | 'createdAt' | 'updatedAt'> | null {
  const kind = legacyKindOf(rec.entityTypeId)
  if (!kind) return null
  const d = recordData(rec)
  const source = String(d.source ?? '')
  const title = legacySourceTitle(source)
  const base = {
    origin: 'legacy' as const,
    game: 'pf2e' as const,
    name: rec.name,
    sortName: rec.name.toLowerCase(),
    level: legacyLevel(kind, d) ?? 0,
    rarity: rarityOf(d.rarity),
    traits: traitsOf(d.traits),
    ...(title ? { publication: { title, remaster: isRemasterSource(source) } } : {}),
    description: '',
    sourceRefs: [{ system: 'dmstome', id: String(rec.id) }],
    legacy: { recordId: rec.id, ...(source ? { source } : {}), ...(d.carried ? { carried: d.carried } : {}) },
  }
  let kindFields: Partial<RulesEntity>
  switch (kind) {
    case 'item': kindFields = convertItem(d); break
    case 'creature': kindFields = convertCreature(d); break
    case 'hazard': kindFields = convertHazard(d); break
    case 'spell': kindFields = convertSpell(d); break
    case 'feat': kindFields = convertFeat(d); break
    case 'condition':
      kindFields = {
        kind, valued: !!d.hasValue, overrides: [], group: str(d.group)?.toLowerCase(),
        description: joinBlocks(legacyText(d.summary), legacyText(d.effects)),
      }
      break
    default: kindFields = convertReference(kind as ReferenceEntry['kind'], d)
  }
  return JSON.parse(JSON.stringify({ ...base, ...kindFields }))
}
