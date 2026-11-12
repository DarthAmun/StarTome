/** The short facts shown under an entry's name, per type. */
import type { Entry } from '@/domain/schema'
import type { ImageRef } from '@/domain/schema'

const cap = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

export function entryFacts(e: Entry): [string, string][] {
  const out: [string, string][] = []
  const add = (label: string, value: string | null | undefined) => { if (value) out.push([label, value]) }
  switch (e.type) {
    case 'npc':
      add('Title', e.data.title); add('Level', e.data.level); add('Ancestry', e.data.ancestry)
      add('Class', [e.data.class, e.data.class2].filter(Boolean).join(' / ')); add('Status', e.data.status)
      if (!e.data.alive) add('Vital', 'Dead')
      break
    case 'location': add('Type', cap(e.data.kind)); add('Discovery', cap(e.data.status)); break
    case 'faction': add('Type', cap(e.data.kind)); add('Size', cap(e.data.size)); add('Headquarters', e.data.headquarters); if (e.data.secret) add('Visibility', 'Secret'); break
    case 'quest': add('Status', cap(e.data.status)); add('Given by', e.data.giver.name); add('Reward', e.data.reward); if (e.data.milestone) add('Milestone', 'Levels the party'); break
    case 'event': add('Date', e.data.date); add('Location', e.data.location); add('Significance', cap(e.data.significance)); break
    case 'session': add('Session', e.data.number); add('Date', e.data.date); add('Mode', cap(e.data.mode)); break
    case 'rumor': add('Status', e.data.statuses.map(cap).join(', ')); add('Source', e.data.source); break
    case 'random-table': add('Die', e.data.die); add('Rows', String(e.data.rows.length)); break
    case 'region': add('Vertices', e.data.polygon.length ? String(e.data.polygon.length) : ''); add('Map', e.data.mapEntryId ? 'Placed' : 'Not placed yet'); break
    case 'note': break
  }
  for (const [k, v] of Object.entries(e.data.extra)) if (typeof v === 'string' || typeof v === 'number') add(cap(k), String(v))
  return out
}

/** One line for lists: the facts that tell entries of a type apart. */
export function entryMeta(e: Entry): string {
  switch (e.type) {
    case 'npc': return [e.data.title, e.data.ancestry, [e.data.class, e.data.class2].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')
    case 'location': return [cap(e.data.kind), cap(e.data.status)].filter(Boolean).join(' · ')
    case 'faction': return [cap(e.data.kind), cap(e.data.size), e.data.headquarters && `@ ${e.data.headquarters}`].filter(Boolean).join(' · ')
    case 'quest': return [cap(e.data.status), e.data.giver.name && `from ${e.data.giver.name}`].filter(Boolean).join(' · ')
    case 'event': return [e.data.date, e.data.location].filter(Boolean).join(' · ')
    case 'session': return [e.data.number && `#${e.data.number}`, e.data.date, cap(e.data.mode)].filter(Boolean).join(' · ')
    case 'rumor': return [e.data.statuses.map(cap).join(', '), e.data.source && `from ${e.data.source}`].filter(Boolean).join(' · ')
    case 'random-table': return `${e.data.die} · ${e.data.rows.length} rows`
    case 'region': return e.data.mapEntryId ? 'On a map' : 'Not placed yet'
    case 'note': return e.tags.map(t => `#${t}`).join(' ')
  }
}

export function entryImage(e: Entry): ImageRef | null {
  switch (e.type) {
    case 'npc': return e.data.portrait
    case 'location': return e.data.banner ?? e.data.map
    case 'faction': return e.data.image
    default: return null
  }
}

/** Entries the type itself calls over: dead NPCs, destroyed places, closed quests, false rumors. */
export function isArchived(e: Entry): boolean {
  return (e.type === 'npc' && !e.data.alive) || (e.type === 'location' && e.data.status === 'destroyed')
    || (e.type === 'quest' && (e.data.status === 'completed' || e.data.status === 'failed')) || (e.type === 'rumor' && e.data.statuses.includes('false'))
}

/** The fields entries of a type can be filtered and grouped by, with the entry's value(s) for each. */
export function entryFacets(e: Entry): Record<string, string | string[]> {
  switch (e.type) {
    case 'npc': return { Vital: e.data.alive ? 'Alive' : 'Dead', Status: cap(e.data.status), Ancestry: cap(e.data.ancestry), Class: [e.data.class, e.data.class2].filter(Boolean).map(cap), Level: e.data.level }
    case 'location': return { Type: cap(e.data.kind), Discovery: cap(e.data.status), Map: e.data.map ? 'Has a map' : 'No map' }
    case 'faction': return { Type: cap(e.data.kind), Size: cap(e.data.size), Visibility: e.data.secret ? 'Secret' : 'Public' }
    case 'quest': return { Status: cap(e.data.status), 'Given by': e.data.giver.name, Milestone: e.data.milestone ? 'Milestone' : '' }
    case 'event': return { Significance: cap(e.data.significance), Location: e.data.location }
    case 'session': return { Mode: cap(e.data.mode) }
    case 'rumor': return { Status: e.data.statuses.map(cap), Source: e.data.source }
    case 'random-table': return { Die: e.data.die }
    case 'region': return { Map: e.data.mapEntryId ? 'On a map' : 'Not placed yet' }
    case 'note': return {}
  }
}

/** Note icons offered by the picker (stored by name, as v0.42 did). */
export const NOTE_ICONS: [name: string, label: string][] = [
  ['gi-scroll-unfurled', 'Scroll'], ['gi-book-aura', 'Lore'], ['gi-death-note', 'Secret'], ['gi-magic-hat', 'Magic'], ['gi-house-keys', 'Key'],
  ['gi-sands-of-time', 'Timeline'], ['gi-all-seeing-eye', 'Mystery'], ['gi-castle', 'Location'], ['gi-coins', 'Treasure'], ['gi-broadsword', 'Combat'],
]

/** The Game Icon an entry carries by name, if any (a note's icon; events and sessions kept one from older versions). */
export function entryIconName(e: Entry): string | null {
  const name = e.type === 'note' ? e.data.icon : e.data.extra.icon
  return typeof name === 'string' && name.startsWith('gi-') ? name : null
}
