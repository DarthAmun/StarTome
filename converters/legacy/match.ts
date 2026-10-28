/**
 * Matching legacy DM's Tome records against the synced compendium (FORK_PLAN.md §8.2).
 *
 * A record matches by kind + normalised name. Several entries can share a name
 * (legacy/remaster twins, adventure reprints); source and level break the tie.
 * Names that only match after a rewrite (parenthetical suffix, "Cat, Leopard",
 * a remaster rename) are "fuzzy" and go to the review list with the candidate
 * preselected. Pure: no database.
 */
import type { RulesKind } from '~/types/rules'

export interface MatchTarget {
  id: string
  kind: RulesKind
  name: string
  level: number
  game: string
  remaster: boolean
  pubTitle?: string
  superseded: boolean
}

export type MatchVia = 'exact' | 'variant' | 'alias'

export interface LegacyRecordInfo {
  kind: RulesKind
  name: string
  level: number | null
  source: string
}

export interface RankedCandidate extends MatchTarget { score: number }

export interface MatchResult {
  via: MatchVia | null
  /** Best first. Empty when nothing matched. */
  candidates: RankedCandidate[]
}

/** "Will-O'-Wisp", "Pactmasters’ Grace" → "will o wisp", "pactmasters grace" */
export function normalizeName(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’‘`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Remaster renames that keep no trace of the old name in Foundry's data.
 * Keys and values are names as printed; matching normalises both.
 */
const ALIASES: Partial<Record<RulesKind, Record<string, string>>> = {
  spell: {
    'Acid Splash': 'Caustic Blast',
    'Animate Dead': 'Summon Undead',
    'Baleful Polymorph': 'Cursed Metamorphosis',
    'Barkskin': 'Oaken Resilience',
    'Bind Soul': 'Seize Soul',
    'Blink': 'Flicker',
    'Burning Hands': 'Breathe Fire',
    'Calm Emotions': 'Calm',
    'Chill Touch': 'Void Warp',
    'Cloudkill': 'Toxic Cloud',
    'Color Spray': 'Dizzying Colors',
    'Comprehend Language': 'Translate',
    'Continual Flame': 'Everlight',
    'Crushing Despair': 'Wave of Despair',
    'Dimension Door': 'Translocate',
    'Dimensional Anchor': 'Planar Tether',
    'Dimensional Lock': 'Planar Seal',
    'Discern Location': 'Pinpoint',
    'Disrupt Undead': 'Vitality Lash',
    'Disrupting Weapons': 'Infuse Vitality',
    'Endure Elements': 'Environmental Endurance',
    'Entangle': 'Entangling Flora',
    'False Life': 'False Vitality',
    'Feather Fall': 'Gentle Landing',
    'Feeblemind': 'Never Mind',
    'Finger of Death': 'Execute',
    'Flaming Sphere': 'Floating Flame',
    'Gentle Repose': 'Peaceful Rest',
    'Glitterdust': 'Revealing Light',
    'Hideous Laughter': 'Laughing Fit',
    'Know Direction': 'Know the Way',
    'Longstrider': 'Tailwind',
    'Mage Armor': 'Mystic Armor',
    'Mage Hand': 'Telekinetic Hand',
    'Magic Aura': 'Disguise Magic',
    'Magic Fang': 'Runic Body',
    'Magic Missile': 'Force Barrage',
    'Magic Weapon': 'Runic Weapon',
    'Meld into Stone': 'One with Stone',
    'Neutralize Poison': 'Cleanse Affliction',
    'Obscuring Mist': 'Mist',
    'Passwall': 'Magic Passage',
    'Produce Flame': 'Ignition',
    'Ray of Enfeeblement': 'Enfeeble',
    'Ray of Frost': 'Frostbite',
    'Remove Curse': 'Cleanse Affliction',
    'Remove Disease': 'Cleanse Affliction',
    'Remove Fear': 'Clear Mind',
    'Remove Paralysis': 'Clear Mind',
    'See Invisibility': 'See the Unseen',
    'Shield Other': 'Share Life',
    'Sound Burst': 'Noise Blast',
    'Spiritual Weapon': 'Spiritual Armament',
    'Stoneskin': 'Mountain Resilience',
    'Tanglefoot': 'Tangle Vine',
    'Tongues': 'Truespeech',
    'True Strike': 'Sure Strike',
  },
  creature: {
    'Manticore': 'Manticore (Quill Tail)',
    'Minotaur': 'Minotaur Hunter',
    'Vampire Spawn Rogue': 'Vampire Servitor',
  },
  condition: { 'Flat-Footed': 'Off-Guard' },
  ancestry: { 'Gnoll': 'Kholo', 'Grippli': 'Tripkee' },
}

const ALIAS_INDEX = new Map<string, string>()
for (const [kind, table] of Object.entries(ALIASES)) {
  for (const [from, to] of Object.entries(table!)) ALIAS_INDEX.set(`${kind}:${normalizeName(from)}`, normalizeName(to))
}

/** Rewrites of a legacy name that may find its Foundry entry, most specific first. */
export function nameVariants(kind: RulesKind, name: string): string[] {
  const out: string[] = []
  const add = (s: string) => { const n = normalizeName(s); if (n && !out.includes(n)) out.push(n) }
  const bare = name.replace(/\s*\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()   // "Clockwork Assassin (AoE5 p.50)"
  add(bare)
  const comma = bare.match(/^([^,]+),\s*(.+)$/)
  if (comma) {
    add(`${comma[2]} ${comma[1]}`)                                                 // "Elemental Vessel, Water" → "Water Elemental Vessel"
    add(comma[2])                                                                  // "Cat, Leopard" → "Leopard"
  }
  if (kind === 'item' && !/\barmou?r$/i.test(bare)) add(`${bare} Armor`)          // "Studded Leather" → "Studded Leather Armor"
  if (/^ki\b/i.test(bare)) add(bare.replace(/^ki\b/i, 'Qi'))                       // monk ki → qi
  return out.filter(v => v !== normalizeName(name))
}

export function aliasOf(kind: RulesKind, name: string): string | undefined {
  return ALIAS_INDEX.get(`${kind}:${normalizeName(name)}`)
}

// ── Sources ────────────────────────────────────────────────────────────────

const SOURCE_ABBR: Record<string, string> = {
  CRB: 'Core Rulebook', APG: "Advanced Player's Guide", GMG: 'Gamemastery Guide', SoM: 'Secrets of Magic',
  'G&G': 'Guns & Gears', BotD: 'Book of the Dead', DA: 'Dark Archive', TV: 'Treasure Vault', RoE: 'Rage of Elements',
  HotW: 'Howl of the Wild', B1: 'Bestiary', B2: 'Bestiary 2', B3: 'Bestiary 3', PC1: 'Player Core', PC2: 'Player Core 2',
  GMC: 'GM Core', MC: 'Monster Core', NPCC: 'NPC Core', LOGM: 'Gods & Magic', LOTG: 'Travel Guide', LOCG: 'Character Guide',
  LOAG: 'Ancestry Guide', LOWG: 'World Guide', LOPSG: 'Pathfinder Society Guide', LOME: 'Mwangi Expanse',
  LOL: 'Legends', LOIL: 'Impossible Lands', LOKL: 'Knights of Lastwall', LOGB: 'The Grand Bazaar', LOMM: 'Monsters of Myth',
}

const REMASTER_BOOKS = /^(player core( 2)?|gm core|monster core( 2)?|npc core|treasure vault \(remastered\)|dark archive \(remastered\))$/i

/** "Core Rulebook p.288" → "Core Rulebook"; "LOGM p.128" → "Gods & Magic". */
export function legacySourceTitle(source: string): string {
  const title = source.replace(/\s*p\.\s*\d+.*$/i, '').trim()
  return SOURCE_ABBR[title] ?? title
}

export function isRemasterSource(source: string): boolean {
  return REMASTER_BOOKS.test(legacySourceTitle(source))
}

function titleKey(t: string): string {
  return normalizeName(t.replace(/&/g, ' and ')).replace(/\b(pathfinder|starfinder|lost omens|the|remastered)\b/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Same book? "Core Rulebook" ~ "Pathfinder Core Rulebook", "Gods & Magic" ~ "Pathfinder Lost Omens Gods & Magic". */
export function sameSource(legacySource: string, pubTitle: string | undefined): boolean {
  if (!pubTitle || !legacySource) return false
  const a = titleKey(legacySourceTitle(legacySource))
  const b = titleKey(pubTitle)
  return !!a && a === b
}

// ── Index & ranking ────────────────────────────────────────────────────────

const LEVELLED = new Set<RulesKind>(['item', 'creature', 'hazard', 'spell', 'feat'])

export function rankCandidates(rec: LegacyRecordInfo, targets: MatchTarget[]): RankedCandidate[] {
  const remasterSource = isRemasterSource(rec.source)
  return targets
    .map(t => {
      let score = 0
      if (sameSource(rec.source, t.pubTitle)) score += 4
      if (LEVELLED.has(rec.kind) && rec.level !== null && t.level === rec.level) score += 2
      if (t.remaster === remasterSource) score += 1
      if (!t.superseded) score += 0.5
      if (t.game === 'pf2e') score += 0.25
      return { ...t, score }
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}

function push<K, V>(map: Map<K, V[]>, key: K, v: V) {
  const list = map.get(key)
  if (list) list.push(v); else map.set(key, [v])
}

export class CompendiumNameIndex {
  private byName = new Map<string, MatchTarget[]>()
  /** Foundry's "Black Dragon (Adult)" as "adult black dragon", the way older books print it. */
  private byAltName = new Map<string, MatchTarget[]>()
  private byKind = new Map<RulesKind, { target: MatchTarget; grams: Set<string> }[]>()

  constructor(targets: Iterable<MatchTarget>) {
    for (const t of targets) {
      push(this.byName, `${t.kind}:${normalizeName(t.name)}`, t)
      const qualified = t.name.match(/^(.+?)\s*\(([^)]+)\)$/)
      if (qualified) push(this.byAltName, `${t.kind}:${normalizeName(`${qualified[2]} ${qualified[1]}`)}`, t)
    }
  }

  /** Entries of a kind whose normalised name equals `name`'s. */
  named(kind: RulesKind, name: string): MatchTarget[] {
    return this.byName.get(`${kind}:${normalizeName(name)}`) ?? []
  }

  match(rec: LegacyRecordInfo): MatchResult {
    const exact = this.named(rec.kind, rec.name)
    if (exact.length) return { via: 'exact', candidates: rankCandidates(rec, exact) }
    for (const v of [normalizeName(rec.name), ...nameVariants(rec.kind, rec.name)]) {
      const hits = this.byName.get(`${rec.kind}:${v}`) ?? this.byAltName.get(`${rec.kind}:${v}`)
      if (hits?.length) return { via: 'variant', candidates: rankCandidates(rec, hits) }
    }
    const alias = aliasOf(rec.kind, rec.name)
    const hits = alias ? this.byName.get(`${rec.kind}:${alias}`) : undefined
    if (hits?.length) return { via: 'alias', candidates: rankCandidates(rec, hits) }
    return { via: null, candidates: [] }
  }

  /** Closest names of the same kind (bigram similarity), for the review list's picker. */
  suggest(rec: LegacyRecordInfo, limit = 5): RankedCandidate[] {
    let list = this.byKind.get(rec.kind)
    if (!list) {
      list = []
      for (const [key, targets] of this.byName) {
        if (!key.startsWith(`${rec.kind}:`)) continue
        const grams = bigrams(key.slice(rec.kind.length + 1))
        for (const target of targets) list.push({ target, grams })
      }
      this.byKind.set(rec.kind, list)
    }
    const mine = bigrams(normalizeName(rec.name))
    if (!mine.size) return []
    const scored: { target: MatchTarget; sim: number }[] = []
    for (const { target, grams } of list) {
      let common = 0
      for (const g of mine) if (grams.has(g)) common++
      const sim = (2 * common) / (mine.size + grams.size)
      if (sim >= 0.45) scored.push({ target, sim })
    }
    scored.sort((a, b) => b.sim - a.sim || a.target.id.localeCompare(b.target.id))
    const seen = new Set<string>()
    const out: RankedCandidate[] = []
    for (const { target, sim } of scored) {
      // One row per name: the best-ranked twin stands for the others
      const key = normalizeName(target.name)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(rankCandidates(rec, this.named(rec.kind, target.name))[0] ?? { ...target, score: sim })
      if (out.length >= limit) break
    }
    return out
  }
}

function bigrams(s: string): Set<string> {
  const t = ` ${s} `
  const out = new Set<string>()
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}
