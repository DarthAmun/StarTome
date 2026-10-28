/**
 * Which packs of a Foundry release are worth syncing, and which are on by default.
 *
 * core      rules content (equipment, spells, feats, conditions, …)   default on
 * bestiary  rulebook bestiaries (Monster Core, NPC Core, Bestiary 1–3) default on
 * adventure adventure-path / Society bestiaries                         opt-in
 * skip      effects, macros, journals, pregens, vehicles, tables …     never synced
 */
export type PackGroup = 'core' | 'bestiary' | 'adventure' | 'skip'

const CORE = new Set([
  'actions', 'conditions', 'equipment', 'spells', 'feats', 'ancestries', 'heritages', 'backgrounds',
  'classes', 'class-features', 'ancestry-features', 'deities', 'hazards', 'bestiary-ability-glossary-srd',
  'bestiary-family-ability-glossary', 'boons-and-curses', 'familiar-abilities', 'adventure-specific-actions',
])

const BESTIARY = new Set([
  'pathfinder-monster-core', 'pathfinder-monster-core-2', 'pathfinder-npc-core', 'pathfinder-bestiary',
  'pathfinder-bestiary-2', 'pathfinder-bestiary-3', 'pathfinder-dark-archive', 'rage-of-elements-bestiary',
  'howl-of-the-wild-bestiary', 'war-of-immortals-bestiary', 'lost-omens-bestiary', 'npc-gallery',
  'alien-core-bestiary', 'rulebook-bestiaries',
])

const SKIP = /effects$|macros$|^journals$|^criticaldeck$|^iconics$|^paizo-pregens$|boons$|^kingmaker-features$|^campaign-effects$|^vehicles$|^rollable-tables$/

export function packGroup(name: string): PackGroup {
  if (SKIP.test(name)) return 'skip'
  if (CORE.has(name)) return 'core'
  if (BESTIARY.has(name)) return 'bestiary'
  if (/bestiary|adventure|plaguestone|one-shot|standalone|pfs-/.test(name)) return 'adventure'
  return 'skip'
}

export function defaultSelected(name: string): boolean {
  const g = packGroup(name)
  return g === 'core' || g === 'bestiary'
}

/** "pathfinder-monster-core-2" → "Pathfinder Monster Core 2" */
export function packLabel(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bSrd\b/, 'SRD').replace(/\bNpc\b/, 'NPC').replace(/\bPfs\b/, 'PFS')
}

/** Document types the converter turns into compendium entries. Everything else is skipped. */
export const CONVERTED_TYPES = new Set([
  'weapon', 'armor', 'shield', 'equipment', 'consumable', 'treasure', 'backpack', 'ammo', 'kit',
  'npc', 'hazard', 'spell', 'feat', 'action', 'condition', 'ancestry', 'heritage', 'background', 'class', 'deity',
])
