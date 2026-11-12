/**
 * The campaign's lore as text for other tools: a folder of Markdown files, one
 * Markdown file for an AI project, and the players' quest board
 * (docs/formats/QUESTBOARD_V2.md). Pure: entries in, text out.
 */
import { stripGmOnly } from './gmContent'
import { REF_PATTERN, canonicalType } from './links'
import type { Campaign, Entry, EntryType } from './schema'

const PLURAL: Record<EntryType, string> = {
  npc: 'NPCs', location: 'Locations', faction: 'Factions', quest: 'Quests', event: 'Events', session: 'Sessions', note: 'Notes',
  'random-table': 'Random Tables', rumor: 'Rumors', region: 'Regions',
}
const ORDER: EntryType[] = ['npc', 'location', 'faction', 'quest', 'event', 'rumor', 'note', 'random-table', 'region', 'session']

/** The facts of an entry as label and value, for frontmatter and headers. */
export function exportFacts(e: Entry): [string, string][] {
  const out: [string, string][] = []
  const add = (k: string, v: unknown) => { if (v !== null && v !== undefined && v !== '' && v !== false) out.push([k, String(v)]) }
  switch (e.type) {
    case 'npc': add('title', e.data.title); add('level', e.data.level); add('ancestry', e.data.ancestry); add('class', [e.data.class, e.data.class2].filter(Boolean).join(' / ')); add('status', e.data.status); add('alive', e.data.alive ? 'yes' : 'no'); break
    case 'location': add('kind', e.data.kind); add('status', e.data.status); break
    case 'faction': add('kind', e.data.kind); add('size', e.data.size); add('headquarters', e.data.headquarters); add('secret', e.data.secret ? 'yes' : ''); break
    case 'quest': add('status', e.data.status); add('giver', e.data.giver.name); add('reward', e.data.reward); add('milestone', e.data.milestone ? 'yes' : ''); break
    case 'event': add('date', e.data.date); add('location', e.data.location); add('significance', e.data.significance); break
    case 'session': add('number', e.data.number); add('date', e.data.date); add('mode', e.data.mode); break
    case 'rumor': add('statuses', e.data.statuses.join(', ')); add('source', e.data.source); break
    case 'random-table': add('die', e.data.die); break
    default: break
  }
  return out
}

function tableRows(e: Entry): string {
  if (e.type !== 'random-table' || !e.data.rows.length) return ''
  return `| ${e.data.die} | Result |\n|---|---|\n${e.data.rows.map(r => `| ${r.min === r.max ? r.min : `${r.min}–${r.max}`} | ${r.result.replace(/\|/g, '\\|')} |`).join('\n')}\n\n`
}

const safeName = (s: string) => s.replace(/[/\\:*?"<>|]/g, '_').trim() || 'Untitled'
const yaml = (v: string) => (/^[\w .,'()/-]+$/.test(v) ? v : JSON.stringify(v))
const body = (e: Entry, gm: boolean) => (gm ? e.body : stripGmOnly(e.body))

/** `{{npc: Kib}}` → `[[Kib]]`, as note tools link pages. */
export function toWikiLinks(text: string): string {
  return text.replace(REF_PATTERN, (all, type: string, name: string) => (canonicalType(type) === 'roll' ? `\`${name.trim()}\`` : `[[${name.trim()}]]`))
}

/** One Markdown file per entry, in a folder per type. */
export function markdownFiles(entries: Entry[], includeGmOnly: boolean): { path: string; text: string }[] {
  const used = new Set<string>()
  return entries.map((e) => {
    let path = `${PLURAL[e.type]}/${safeName(e.name)}.md`
    for (let n = 2; used.has(path.toLowerCase()); n++) path = `${PLURAL[e.type]}/${safeName(e.name)} ${n}.md`
    used.add(path.toLowerCase())
    const front = [['type', e.type], ...exportFacts(e), ...(e.tags.length ? [['tags', `[${e.tags.join(', ')}]`]] : [])] as [string, string][]
    const fm = front.map(([k, v]) => `${k}: ${k === 'tags' ? v : yaml(v)}`).join('\n')
    return { path, text: `---\n${fm}\n---\n\n# ${e.name}\n\n${tableRows(e)}${toWikiLinks(body(e, includeGmOnly))}\n` }
  })
}

/** The whole campaign as one Markdown file, laid out for reading by an AI project. */
export function singleMarkdown(campaign: Campaign, entries: Entry[], includeGmOnly: boolean): string {
  const out = [`# ${campaign.name}`, '', `Game: ${campaign.game === 'sf2e' ? 'Starfinder 2e' : 'Pathfinder 2e'}`, '']
  if (campaign.description) out.push(campaign.description, '')
  out.push(`This file lists the campaign's entries by type. Links between entries are written [[Name]].${includeGmOnly ? ' Blocks marked [!hidden] are for the GM only.' : ' GM-only text has been left out.'}`, '')
  for (const type of ORDER) {
    const list = entries.filter(e => e.type === type).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    if (!list.length) continue
    out.push(`## ${PLURAL[type]}`, '')
    for (const e of list) {
      out.push(`### ${e.name}`, '')
      const facts = [...exportFacts(e), ...(e.tags.length ? [['tags', e.tags.join(', ')] as [string, string]] : [])]
      if (facts.length) out.push(facts.map(([k, v]) => `- ${k}: ${v}`).join('\n'), '')
      const text = `${tableRows(e)}${toWikiLinks(body(e, includeGmOnly))}`.trim()
      if (text) out.push(text, '')
    }
  }
  return `${out.join('\n').trimEnd()}\n`
}

// ── Quest board ────────────────────────────────────────────────────────────

export interface QuestBoardItem { name: string; compendiumId: string | null; level: number | null; price: { cp: number } | null; rarity: string | null; traits: string[] }
export interface QuestBoard {
  version: 2
  app: 'startome'
  type: 'questboard'
  exportedAt: string
  campaign: { id: string; name: string; game: 'pf2e' | 'sf2e' }
  quests: { id: string; name: string; status: string | null; giver: string | null; description: string; reward: string; rewardItems: QuestBoardItem[] }[]
}

export function itemRefNames(text: string): string[] {
  const names = new Map<string, string>()
  for (const m of text.matchAll(REF_PATTERN)) if (canonicalType(m[1] ?? '') === 'item') names.set((m[2] ?? '').trim().toLowerCase(), (m[2] ?? '').trim())
  return [...names.values()]
}

export type ItemLookup = (name: string) => { id: string; name: string; level: number; price?: unknown; rarity?: unknown; traits?: unknown } | undefined

/** The players' quest list: GM-only text removed, `{{item: Name}}` in reward or text looked up in the compendium. */
export function buildQuestBoard(campaign: Campaign, entries: Entry[], lookup: ItemLookup, exportedAt: string): QuestBoard {
  return {
    version: 2, app: 'startome', type: 'questboard', exportedAt, campaign: { id: campaign.id, name: campaign.name, game: campaign.game },
    quests: entries.flatMap((e) => {
      if (e.type !== 'quest') return []
      const description = stripGmOnly(e.body), reward = stripGmOnly(e.data.reward)
      const rewardItems = [...new Set([...itemRefNames(reward), ...itemRefNames(description)])].map((name): QuestBoardItem => {
        const item = lookup(name)
        const price = item?.price && typeof item.price === 'object' && 'cp' in item.price && typeof item.price.cp === 'number' ? { cp: item.price.cp } : null
        return item
          ? { name: item.name, compendiumId: item.id, level: item.level, price, rarity: typeof item.rarity === 'string' ? item.rarity : null, traits: Array.isArray(item.traits) ? item.traits.map(String) : [] }
          : { name, compendiumId: null, level: null, price: null, rarity: null, traits: [] }
      })
      return [{ id: e.id, name: e.name, status: e.data.status, giver: e.data.giver.name || null, description, reward, rewardItems }]
    }),
  }
}
