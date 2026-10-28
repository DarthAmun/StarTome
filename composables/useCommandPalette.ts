import { getDb } from '~/composables/useDb'
import { useEntities } from '~/composables/useEntities'
import { rulesSearch } from '~/composables/useRules'
import { RULES_KIND_CONFIG, RULES_KINDS } from '~/types/rules'
import { lsKey } from '~/utils/appNamespace'

export interface CmdContext {
  campaign: { id: number; name: string } | null
}

export type CmdItem =
  | { kind: 'cmd';     id: string; icon: string; label: string; hint: string; canExecute: boolean; warning?: string; keepOpen?: boolean; execute?: () => Promise<void> | void }
  | { kind: 'section'; label: string }
  | { kind: 'pick';    id: string; icon: string; label: string; hint: string; execute: () => void; fill?: string }

// ── Constants ────────────────────────────────────────────────────────────────

interface GotoTarget {
  aliases: string[]
  label: string
  segment: string       // campaign-relative path ('npcs', 'graphs', '' for dashboard)
  absolute?: string     // absolute path when not campaign-scoped ('/settings')
  needsCampaign: boolean
}

const GOTO_TARGETS: GotoTarget[] = [
  { aliases: ['npcs', 'npc', 'characters', 'character'],                         label: 'NPCs',          segment: 'npcs',           needsCampaign: true  },
  { aliases: ['locations', 'location', 'places', 'place'],                       label: 'Locations',     segment: 'locations',      needsCampaign: true  },
  { aliases: ['factions', 'faction', 'guilds', 'guild'],                         label: 'Factions',      segment: 'factions',       needsCampaign: true  },
  { aliases: ['quests', 'quest', 'missions', 'mission'],                         label: 'Quests',        segment: 'quests',         needsCampaign: true  },
  { aliases: ['events', 'event'],                                                 label: 'Events',        segment: 'events',         needsCampaign: true  },
  { aliases: ['sessions', 'session'],                                             label: 'Sessions',      segment: 'sessions',       needsCampaign: true  },
  { aliases: ['notes', 'note'],                                                   label: 'Notes',         segment: 'notes',          needsCampaign: true  },
  { aliases: ['random-tables', 'random-table', 'tables', 'table', 'randomtable'],label: 'Random Tables', segment: 'random-tables',  needsCampaign: true  },
  { aliases: ['rumors', 'rumor', 'gossip'],                                       label: 'Rumors',        segment: 'rumors',         needsCampaign: true  },
  { aliases: ['encounters', 'encounter', 'battle', 'combat'],                    label: 'Encounters',    segment: 'encounters',     needsCampaign: true  },
  { aliases: ['graphs', 'graph'],                                                 label: 'Graphs',        segment: 'graphs',         needsCampaign: true  },
  { aliases: ['chronicle', 'timeline', 'history'],                               label: 'Chronicle',     segment: 'chronicle',      needsCampaign: true  },
  { aliases: ['dashboard', 'home', 'overview', 'index'],                         label: 'Dashboard',     segment: '',               needsCampaign: true  },
  { aliases: ['settings', 'preferences', 'config'],                              label: 'Settings',      segment: 'settings',       absolute: '/settings', needsCampaign: false },
  { aliases: ['compendium', 'library', 'rules'],                                  label: 'Compendium',    segment: 'compendium',     absolute: '/compendium/items', needsCampaign: false },
  // One target per compendium kind: "goto spells", "goto monsters"
  ...RULES_KINDS.map(kind => {
    const cfg = RULES_KIND_CONFIG[kind]
    return {
      aliases: [cfg.segment, kind, ...(kind === 'creature' ? ['monsters', 'monster', 'bestiary'] : [])],
      label: `Compendium: ${cfg.plural}`,
      segment: cfg.segment,
      absolute: `/compendium/${cfg.segment}`,
      needsCampaign: false,
    }
  }),
]

interface EntityTypeCmd {
  aliases: string[]
  type: string
  label: string
  plural: string
  segment: string
}

const ENTITY_TYPES_CMD: EntityTypeCmd[] = [
  { aliases: ['npc', 'npcs', 'character', 'characters'],               type: 'npc',          label: 'NPC',          plural: 'NPCs',          segment: 'npcs' },
  { aliases: ['location', 'locations', 'place', 'places'],             type: 'location',     label: 'Location',     plural: 'Locations',     segment: 'locations' },
  { aliases: ['faction', 'factions'],                                   type: 'faction',      label: 'Faction',      plural: 'Factions',      segment: 'factions' },
  { aliases: ['quest', 'quests'],                                       type: 'quest',        label: 'Quest',        plural: 'Quests',        segment: 'quests' },
  { aliases: ['event', 'events'],                                       type: 'event',        label: 'Event',        plural: 'Events',        segment: 'events' },
  { aliases: ['session', 'sessions'],                                   type: 'session',      label: 'Session',      plural: 'Sessions',      segment: 'sessions' },
  { aliases: ['note', 'notes'],                                         type: 'note',         label: 'Note',         plural: 'Notes',         segment: 'notes' },
  { aliases: ['random-table', 'table', 'tables', 'randomtable'],       type: 'random-table', label: 'Random Table', plural: 'Random Tables', segment: 'random-tables' },
  { aliases: ['rumor', 'rumors', 'gossip'],                             type: 'rumor',        label: 'Rumor',        plural: 'Rumors',        segment: 'rumors' },
]

const COMMAND_VERBS = [
  'goto', 'go', 'navigate', 'nav',
  'add', 'create', 'new',
  'find', 'search', 'open', 'show',
  'delete', 'del', 'remove',
  'edit', 'update',
  'append', 'write',
  'rename',
  'set', 'use',
  'unset', 'clear',
  'theme',
  'roll', 'dice',
]

// ── Singleton context ────────────────────────────────────────────────────────

const _ctx = ref<CmdContext>({ campaign: null })

if (import.meta.client) {
  try {
    const s = localStorage.getItem(lsKey('cmd-ctx'))
    if (s) _ctx.value.campaign = JSON.parse(s).campaign ?? null
  } catch {}
}

function _saveCtx() {
  if (import.meta.client) localStorage.setItem(lsKey('cmd-ctx'), JSON.stringify(_ctx.value))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fuzzyScore(alias: string, query: string): number {
  if (alias === query) return 3
  if (alias.startsWith(query)) return 2
  if (alias.includes(query)) return 1
  return 0
}

function matchGotoTarget(word: string): GotoTarget | null {
  let best: GotoTarget | null = null
  let bestScore = 0
  for (const t of GOTO_TARGETS) {
    for (const a of t.aliases) {
      const s = fuzzyScore(a, word)
      if (s > bestScore) { bestScore = s; best = t }
    }
  }
  return bestScore > 0 ? best : null
}

function matchEntityType(word: string): EntityTypeCmd | null {
  let best: EntityTypeCmd | null = null
  let bestScore = 0
  for (const t of ENTITY_TYPES_CMD) {
    for (const a of t.aliases) {
      const s = fuzzyScore(a, word)
      if (s > bestScore) { bestScore = s; best = t }
    }
  }
  return bestScore > 0 ? best : null
}

// ── Suggestion builders ──────────────────────────────────────────────────────

function gotoSuggestions(
  target: GotoTarget,
  ctx: CmdContext,
  campaigns: { id: number; name: string }[],
  router: any,
  close: () => void,
): CmdItem[] {
  const items: CmdItem[] = []

  if (target.absolute) {
    items.push({
      kind: 'cmd', id: `goto-${target.segment}`,
      icon: '→', label: `goto ${target.label.toLowerCase()}`,
      hint: target.label,
      canExecute: true,
      execute: () => { router.push(target.absolute!); close() },
    })
    return items
  }

  if (!ctx.campaign) {
    items.push({
      kind: 'cmd', id: `goto-${target.segment}-nocampaign`,
      icon: '→', label: `goto ${target.label.toLowerCase()}`,
      hint: target.label,
      canExecute: false,
      warning: 'select a campaign',
    })
    if (campaigns.length) {
      items.push({ kind: 'section', label: 'Select campaign' })
      for (const c of campaigns) {
        items.push({
          kind: 'pick', id: `pick-camp-${c.id}`,
          icon: '📋', label: c.name,
          hint: `Set context & go to ${target.label}`,
          execute: () => {
            _ctx.value.campaign = c; _saveCtx()
            router.push(`/campaign/${c.id}/${target.segment}`); close()
          },
        })
      }
    }
  } else {
    const path = `/campaign/${ctx.campaign.id}/${target.segment}`
    items.push({
      kind: 'cmd', id: `goto-${target.segment}`,
      icon: '→', label: `goto ${target.label.toLowerCase()}`,
      hint: `${target.label} · ${ctx.campaign.name}`,
      canExecute: true,
      execute: () => { router.push(path); close() },
    })
  }
  return items
}

async function addSuggestions(
  typeWord: string,
  nameRest: string,
  ctx: CmdContext,
  campaigns: { id: number; name: string }[],
  router: any,
  close: () => void,
): Promise<CmdItem[]> {
  const items: CmdItem[] = []
  const db = getDb()
  const now = new Date().toISOString()

  // Special: add encounter or graph
  if (['encounter', 'encounters', 'battle'].includes(typeWord) || ['graph', 'graphs'].includes(typeWord)) {
    const isEnc = ['encounter', 'encounters', 'battle'].includes(typeWord)
    const label = isEnc ? 'encounter' : 'graph'
    const name = nameRest.trim() || (isEnc ? 'New Encounter' : 'New Graph')

    if (!ctx.campaign) {
      items.push({ kind: 'cmd', id: `add-${label}-nocamp`, icon: '＋', label: `add ${label} "${name}"`, hint: `Create ${label}`, canExecute: false, warning: 'select a campaign' })
      if (campaigns.length) {
        items.push({ kind: 'section', label: 'Select campaign' })
        for (const c of campaigns) {
          items.push({ kind: 'pick', id: `pick-addenc-${c.id}`, icon: '📋', label: c.name, hint: `Set context & create ${label}`, execute: () => { _ctx.value.campaign = c; _saveCtx(); executeAdd(); } })
        }
      }
      async function executeAdd() {
        if (!_ctx.value.campaign) return
        if (isEnc) {
          const id = await db.encounters.add({ campaign_id: _ctx.value.campaign.id, name, grid_size: 60, grid_offset_x: 0, grid_offset_y: 0, fog_enabled: false, fog_data: '{}', map_source: null, map_type: null, combat_log: '[]', tokens_json: '[]', created_at: now } as any)
          router.push(`/encounter/${id}`); close()
        } else {
          const { dbApi } = await import('~/composables/useDb')
          const id = await dbApi.graphLayout.create(_ctx.value.campaign.id, name)
          router.push(`/campaign/${_ctx.value.campaign.id}/graphs?graph=${id}`); close()
        }
      }
      return items
    }

    items.push({
      kind: 'cmd', id: `add-${label}`, icon: '＋',
      label: `add ${label} "${name}"`, hint: `Create in ${ctx.campaign.name}`,
      canExecute: !!nameRest.trim(),
      warning: nameRest.trim() ? undefined : 'type a name',
      execute: async () => {
        if (!ctx.campaign) return
        if (isEnc) {
          const id = await db.encounters.add({ campaign_id: ctx.campaign.id, name, grid_size: 60, grid_offset_x: 0, grid_offset_y: 0, fog_enabled: false, fog_data: '{}', map_source: null, map_type: null, combat_log: '[]', tokens_json: '[]', created_at: now } as any)
          router.push(`/encounter/${id}`); close()
        } else {
          const { dbApi } = await import('~/composables/useDb')
          const id = await dbApi.graphLayout.create(ctx.campaign.id, name)
          router.push(`/campaign/${ctx.campaign.id}/graphs?graph=${id}`); close()
        }
      },
    })
    return items
  }

  const eType = matchEntityType(typeWord)

  if (!typeWord || !eType) {
    // Show campaign entity types as picks
    for (const t of ENTITY_TYPES_CMD) {
      items.push({ kind: 'pick', id: `add-type-${t.type}`, icon: '＋', label: `add ${t.label.toLowerCase()} …`, hint: `Create a ${t.label}`, execute: () => {}, fill: `> add ${t.label.toLowerCase()} ` })
    }
    return items
  }


  // ── Campaign entity type ──────────────────────────────────────────────────
  const name = nameRest.trim()
  if (!ctx.campaign) {
    items.push({ kind: 'cmd', id: `add-${eType!.type}-nocamp`, icon: '＋', label: `add ${eType!.label.toLowerCase()} "${name || '…'}"`, hint: `Create ${eType!.label}`, canExecute: false, warning: 'select a campaign' })
    if (campaigns.length) {
      items.push({ kind: 'section', label: 'Select campaign' })
      for (const c of campaigns) {
        items.push({
          kind: 'pick', id: `pick-add-${c.id}`, icon: '📋', label: c.name,
          hint: `Set context & create ${eType!.label}`,
          execute: () => { _ctx.value.campaign = c; _saveCtx() },
        })
      }
    }
    return items
  }

  items.push({
    kind: 'cmd', id: `add-${eType!.type}`, icon: '＋',
    label: `add ${eType!.label.toLowerCase()} "${name || '…'}"`,
    hint: `Create ${eType!.label} in ${ctx.campaign.name}`,
    canExecute: !!name,
    warning: name ? undefined : 'type a name',
    execute: async () => {
      if (!ctx.campaign || !name) return
      const notesStore = useEntities()
      const entity = await notesStore.createEntity(ctx.campaign.id, eType!.type as any, name)
      if (entity) router.push(`/campaign/${ctx.campaign.id}/${eType!.segment}/${entity.id}`)
      close()
    },
  })
  return items
}

async function findSuggestions(
  typeWord: string,
  nameRest: string,
  ctx: CmdContext,
  campaigns: { id: number; name: string }[],
  router: any,
  close: () => void,
): Promise<CmdItem[]> {
  const items: CmdItem[] = []
  const { dbApi } = await import('~/composables/useDb')

  const eType = matchEntityType(typeWord)

  // ── Campaign entity search ────────────────────────────────────────────────
  if (eType) {
    if (!ctx.campaign) {
      items.push({ kind: 'cmd', id: 'find-nocamp', icon: '⌕', label: `find ${eType.label.toLowerCase()} "${nameRest || '…'}"`, hint: `Search ${eType.plural}`, canExecute: false, warning: 'select a campaign' })
      if (campaigns.length) {
        items.push({ kind: 'section', label: 'Select campaign' })
        for (const c of campaigns) {
          items.push({ kind: 'pick', id: `pick-find-${c.id}`, icon: '📋', label: c.name, hint: 'Set context & search', execute: () => { _ctx.value.campaign = c; _saveCtx() } })
        }
      }
      return items
    }
    if (!nameRest.trim()) {
      items.push({ kind: 'cmd', id: 'find-noname', icon: '⌕', label: `find ${eType.label.toLowerCase()} …`, hint: `Search ${eType.plural} in ${ctx.campaign.name}`, canExecute: false, warning: 'type a name' })
      return items
    }
    const rows = await dbApi.entities.search(nameRest.toLowerCase(), 8)
    const matches = rows.filter((r: any) => r.type === eType.type)
    if (!matches.length) {
      items.push({ kind: 'cmd', id: 'find-none', icon: '⌕', label: `No ${eType.plural} matching "${nameRest}"`, hint: '', canExecute: false })
    }
    for (const r of matches) {
      items.push({
        kind: 'pick', id: `find-ent-${r.id}`, icon: '⌕',
        label: r.name,
        hint: `${eType.label} · ${ctx.campaign.name}`,
        execute: () => { router.push(`/campaign/${r.campaign_id}/${eType.segment}/${r.id}`); close() },
      })
    }
    return items
  }


  // ── Fallback: compendium search ("find spell fireball", "find fireball") ──
  const kind = RULES_KINDS.find(k => k === typeWord.toLowerCase() || RULES_KIND_CONFIG[k].plural.toLowerCase() === typeWord.toLowerCase())
  const text = (kind ? nameRest : `${typeWord} ${nameRest}`).trim()
  if (!text) {
    items.push({ kind: 'cmd', id: 'find-rules-noname', icon: '⌕', label: `find ${typeWord} …`, hint: 'Search the compendium', canExecute: false, warning: 'type a name' })
    return items
  }
  const hits = (await rulesSearch(text, kind ? 30 : 8)).filter(e => !kind || e.kind === kind).slice(0, 8)
  if (!hits.length) {
    items.push({ kind: 'cmd', id: 'find-rules-none', icon: '⌕', label: `No compendium entries matching "${text}"`, hint: '', canExecute: false })
  }
  for (const e of hits) {
    const cfg = RULES_KIND_CONFIG[e.kind]
    items.push({
      kind: 'pick', id: `find-rules-${e.id}`, icon: '⌕',
      label: e.name,
      hint: `${cfg.label}${cfg.hasLevel ? ` ${e.level}` : ''} · Compendium`,
      execute: () => { router.push(`/compendium/${cfg.segment}?id=${e.id}`); close() },
    })
  }
  return items
}

// ── Pipe parser ──────────────────────────────────────────────────────────────
// " |" (or " | ") separates the name part from the command payload.
// Trailing space after the pipe is optional so users don't have to type it.
function parsePipe(str: string): [string, string | null] {
  const idx = str.indexOf(' |')
  if (idx === -1) return [str.trim(), null]
  const after = str.slice(idx + 2) // everything after " |"
  return [str.slice(0, idx).trim(), after.startsWith(' ') ? after.slice(1) : after]
}

// ── Delete ───────────────────────────────────────────────────────────────────
async function deleteSuggestions(
  typeWord: string,
  nameStr: string,
  ctx: CmdContext,
  campaigns: { id: number; name: string }[],
  close: () => void,
): Promise<CmdItem[]> {
  const items: CmdItem[] = []
  const { dbApi } = await import('~/composables/useDb')
  const eType = matchEntityType(typeWord)

  if (!typeWord || !eType) {
    for (const t of ENTITY_TYPES_CMD) {
      items.push({ kind: 'pick', id: `del-type-${t.type}`, icon: '✕', label: `delete ${t.label.toLowerCase()} …`, hint: `Delete a ${t.label}`, execute: () => {}, fill: `> delete ${t.label.toLowerCase()} ` })
    }
    return items
  }

  if (!nameStr.trim()) {
    items.push({ kind: 'cmd', id: 'del-noname', icon: '✕', label: `delete ${eType!.label.toLowerCase()} …`, hint: `Search ${eType!.plural}`, canExecute: false, warning: 'type a name' })
    return items
  }
  const notesStore = useEntities()
  const allRows = await dbApi.entities.search(nameStr.toLowerCase(), 8)
  const byType = allRows.filter((r: any) => r.type === eType!.type)
  // Prefer campaign-context matches; fall back to all campaigns
  const rows = ctx.campaign ? (byType.filter((r: any) => r.campaign_id === ctx.campaign!.id).length ? byType.filter((r: any) => r.campaign_id === ctx.campaign!.id) : byType) : byType
  if (!rows.length) { items.push({ kind: 'cmd', id: 'del-none', icon: '✕', label: `No ${eType!.plural} matching "${nameStr}"`, hint: '', canExecute: false }); return items }
  const exact = rows.find((r: any) => r.name.toLowerCase() === nameStr.toLowerCase())
  if (exact) {
    const campaignHint = exact.campaign_id ? `Campaign ${exact.campaign_id}` : ''
    items.push({ kind: 'cmd', id: 'del-warn', icon: '⚠', label: `Delete ${eType!.label.toLowerCase()} "${exact.name}"?`, hint: campaignHint, canExecute: false })
    items.push({ kind: 'section', label: 'Confirm deletion' })
    items.push({ kind: 'pick', id: 'del-yes', icon: '✓', label: 'Yes, delete it', hint: 'This cannot be undone', execute: async () => { await notesStore.deleteEntity(exact.id); close() } })
    items.push({ kind: 'pick', id: 'del-no', icon: '✕', label: 'No, cancel', hint: '', execute: () => {}, fill: '' })
  } else {
    for (const r of rows) {
      items.push({ kind: 'pick', id: `del-pick-${r.id}`, icon: '✕', label: r.name, hint: `Delete this ${eType!.label}`, execute: () => {}, fill: `> delete ${typeWord} ${r.name}` })
    }
  }
  return items
}

// ── Edit attribute ────────────────────────────────────────────────────────────
// Syntax: > edit [type] [name] | [key] [value…]
// Before pipe → fuzzy search fills the name. After pipe → key then value.
async function editSuggestions(
  typeWord: string,
  nameStr: string,
  ctx: CmdContext,
  campaigns: { id: number; name: string }[],
  close: () => void,
): Promise<CmdItem[]> {
  const items: CmdItem[] = []
  const { dbApi } = await import('~/composables/useDb')
  const eType = matchEntityType(typeWord)

  if (!typeWord || !eType) {
    for (const t of ENTITY_TYPES_CMD) {
      items.push({ kind: 'pick', id: `edit-type-${t.type}`, icon: '✎', label: `edit ${t.label.toLowerCase()} …`, hint: `Set an attribute`, execute: () => {}, fill: `> edit ${t.label.toLowerCase()} ` })
    }
    return items
  }

  const [namePart, afterPipe] = parsePipe(nameStr)

  if (!ctx.campaign) {
    items.push({ kind: 'cmd', id: 'edit-nocamp', icon: '✎', label: `edit ${eType!.label.toLowerCase()} …`, hint: '', canExecute: false, warning: 'select a campaign' })
    if (campaigns.length) {
      items.push({ kind: 'section', label: 'Select campaign' })
      for (const c of campaigns) items.push({ kind: 'pick', id: `pick-edit-${c.id}`, icon: '📋', label: c.name, hint: 'Set context', execute: () => { _ctx.value.campaign = c; _saveCtx() } })
    }
    return items
  }
  if (afterPipe === null) {
    if (!namePart) {
      items.push({ kind: 'cmd', id: 'edit-noname', icon: '✎', label: `edit ${eType!.label.toLowerCase()} …`, hint: `Search ${eType!.plural}`, canExecute: false, warning: 'type a name' })
      return items
    }
    const allRows = await dbApi.entities.search(namePart.toLowerCase(), 8)
    const byType = allRows.filter((r: any) => r.type === eType!.type)
    const matches = ctx.campaign
      ? (byType.filter((r: any) => r.campaign_id === ctx.campaign!.id).length
          ? byType.filter((r: any) => r.campaign_id === ctx.campaign!.id)
          : byType)
      : byType
    if (!matches.length) items.push({ kind: 'cmd', id: 'edit-none', icon: '✎', label: `No ${eType!.plural} matching "${namePart}"`, hint: '', canExecute: false })
    for (const r of matches) {
      items.push({ kind: 'pick', id: `edit-pick-${r.id}`, icon: '✎', label: r.name, hint: `Edit ${eType!.label} · type key and value after |`, execute: () => {}, fill: `> edit ${typeWord} ${r.name} | ` })
    }
    return items
  }
  const attrWords = afterPipe.trim().split(/\s+/).filter(Boolean)
  const key = attrWords[0] ?? ''
  const value = attrWords.slice(1).join(' ')
  const notesStore = useEntities()
  const allEntityRows = await dbApi.entities.search(namePart.toLowerCase(), 8)
  const byEntityType = allEntityRows.filter((r: any) => r.type === eType!.type)
  const preferredRows = ctx.campaign
    ? (byEntityType.filter((r: any) => r.campaign_id === ctx.campaign!.id).length
        ? byEntityType.filter((r: any) => r.campaign_id === ctx.campaign!.id)
        : byEntityType)
    : byEntityType
  const entityRow = preferredRows.find((r: any) => r.name.toLowerCase() === namePart.toLowerCase())
    ?? preferredRows[0] ?? null
  const entityAttrs: Record<string, any> = entityRow
    ? (typeof entityRow.attributes === 'string' ? JSON.parse(entityRow.attributes || '{}') : (entityRow.attributes ?? {}))
    : {}
  const entityCampaignHint = entityRow?.campaign_id
    ? (campaigns.find(c => c.id === entityRow.campaign_id)?.name ?? `Campaign ${entityRow.campaign_id}`)
    : ''
  // No key yet — show existing attributes as picks
  if (!key && entityRow) {
    const keys = Object.keys(entityAttrs)
    if (keys.length) {
      items.push({ kind: 'section', label: `${entityRow.name} — pick an attribute` })
      for (const k of keys) {
        const v = entityAttrs[k]
        const display = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')
        items.push({ kind: 'pick', id: `edit-attr-${k}`, icon: '✎', label: `${k}${display ? `: ${display}` : ''}`, hint: display ? 'Current value · type new value after |' : 'Empty · type value after |', execute: () => {}, fill: `> edit ${typeWord} ${namePart} | ${k} ` })
      }
      return items
    }
    items.push({ kind: 'cmd', id: 'edit-no-attrs', icon: '✎', label: 'No attributes yet — type a new key', hint: `e.g. > edit ${typeWord} ${namePart} | strength 18`, canExecute: false })
    return items
  }
  // Key typed — find the actual attribute key (case-insensitive) and collect unique values
  const actualKey = key
    ? (Object.keys(entityAttrs).find(k => k.toLowerCase() === key.toLowerCase()) ?? key)
    : key
  if (key && entityRow) {
    const seen = new Set<string>()
    for (const e of notesStore.entities) {
      if (e.type !== eType!.type) continue
      const attrs = e.attributes as Record<string, any>
      const matchKey = Object.keys(attrs).find(k => k.toLowerCase() === key.toLowerCase())
      if (!matchKey) continue
      const raw = attrs[matchKey]
      const display = typeof raw === 'object' ? JSON.stringify(raw) : String(raw ?? '').trim()
      if (display) seen.add(display)
    }
    const filtered = [...seen].filter(v => !value || v.toLowerCase().includes(value.toLowerCase()))
    if (filtered.length) {
      items.push({ kind: 'section', label: `Existing values for "${actualKey}"` })
      for (const v of filtered) {
        items.push({
          kind: 'pick', id: `edit-val-${v}`, icon: '◉', label: v,
          hint: 'Select this value',
          execute: async () => {
            if (!entityRow) return
            await notesStore.updateEntity(entityRow.id, { attributes: { ...entityAttrs, [actualKey]: v } })
            close()
          },
        })
      }
    }
  }
  items.push({
    kind: 'cmd', id: 'edit-exec', icon: '✎',
    label: `edit "${namePart}" · ${key || '…'} → "${value || '…'}"`,
    hint: entityRow ? entityCampaignHint : `No match for "${namePart}"`,
    canExecute: !!(entityRow && key && value),
    warning: !entityRow ? `no match for "${namePart}"` : !key ? 'type a key' : !value ? 'type a value' : undefined,
    execute: async () => {
      if (!entityRow || !key || !value) return
      await notesStore.updateEntity(entityRow.id, { attributes: { ...entityAttrs, [actualKey]: value } })
      close()
    },
  })
  return items
}

// ── Append paragraph ──────────────────────────────────────────────────────────
// Syntax: > append [type] [name] | [paragraph text…]
// Campaign entities: appends to entity.content.
async function appendSuggestions(
  typeWord: string,
  nameStr: string,
  ctx: CmdContext,
  campaigns: { id: number; name: string }[],
  close: () => void,
): Promise<CmdItem[]> {
  const items: CmdItem[] = []
  const { dbApi } = await import('~/composables/useDb')
  const eType = matchEntityType(typeWord)

  if (!typeWord || !eType) {
    for (const t of ENTITY_TYPES_CMD) {
      items.push({ kind: 'pick', id: `app-type-${t.type}`, icon: '¶', label: `append to ${t.label.toLowerCase()} …`, hint: `Add a paragraph`, execute: () => {}, fill: `> append ${t.label.toLowerCase()} ` })
    }
    return items
  }

  const [namePart, afterPipe] = parsePipe(nameStr)

  if (!ctx.campaign) {
    items.push({ kind: 'cmd', id: 'app-nocamp', icon: '¶', label: `append to ${eType!.label.toLowerCase()} …`, hint: '', canExecute: false, warning: 'select a campaign' })
    if (campaigns.length) {
      items.push({ kind: 'section', label: 'Select campaign' })
      for (const c of campaigns) items.push({ kind: 'pick', id: `pick-app-${c.id}`, icon: '📋', label: c.name, hint: 'Set context', execute: () => { _ctx.value.campaign = c; _saveCtx() } })
    }
    return items
  }
  if (afterPipe === null) {
    if (!namePart) {
      items.push({ kind: 'cmd', id: 'app-noname', icon: '¶', label: `append to ${eType!.label.toLowerCase()} …`, hint: `Search ${eType!.plural}`, canExecute: false, warning: 'type a name' })
      return items
    }
    const allRows = await dbApi.entities.search(namePart.toLowerCase(), 8)
    const byType = allRows.filter((r: any) => r.type === eType!.type)
    const matches = ctx.campaign
      ? (byType.filter((r: any) => r.campaign_id === ctx.campaign!.id).length
          ? byType.filter((r: any) => r.campaign_id === ctx.campaign!.id)
          : byType)
      : byType
    if (!matches.length) items.push({ kind: 'cmd', id: 'app-none', icon: '¶', label: `No ${eType!.plural} matching "${namePart}"`, hint: '', canExecute: false })
    for (const r of matches) {
      items.push({ kind: 'pick', id: `app-pick-${r.id}`, icon: '¶', label: r.name, hint: `Append paragraph · type text after |`, execute: () => {}, fill: `> append ${typeWord} ${r.name} | ` })
    }
    return items
  }
  const text = afterPipe.trim()
  const notesStore = useEntities()
  const allAppRows = await dbApi.entities.search(namePart.toLowerCase(), 8)
  const byAppType = allAppRows.filter((r: any) => r.type === eType!.type)
  const preferredAppRows = ctx.campaign
    ? (byAppType.filter((r: any) => r.campaign_id === ctx.campaign!.id).length
        ? byAppType.filter((r: any) => r.campaign_id === ctx.campaign!.id)
        : byAppType)
    : byAppType
  const appEntityRow = preferredAppRows.find((r: any) => r.name.toLowerCase() === namePart.toLowerCase())
    ?? preferredAppRows[0] ?? null
  const appCampaignHint = appEntityRow?.campaign_id
    ? (campaigns.find(c => c.id === appEntityRow.campaign_id)?.name ?? `Campaign ${appEntityRow.campaign_id}`)
    : ''
  items.push({
    kind: 'cmd', id: 'app-exec', icon: '¶',
    label: `append to "${namePart}" · "${text || '…'}"`,
    hint: appEntityRow ? appCampaignHint : `No match for "${namePart}"`,
    canExecute: !!(appEntityRow && text),
    warning: !appEntityRow ? `no match for "${namePart}"` : !text ? 'type the paragraph text' : undefined,
    execute: async () => {
      if (!appEntityRow || !text) return
      const current = (typeof appEntityRow.content === 'string' ? appEntityRow.content : '') || ''
      await notesStore.updateEntity(appEntityRow.id, { content: current ? `${current}\n\n${text}` : text })
      close()
    },
  })
  return items
}

// ── Rename ────────────────────────────────────────────────────────────────────
// Syntax: > rename [type] [name] | [new name]
async function renameSuggestions(
  typeWord: string,
  nameStr: string,
  ctx: CmdContext,
  campaigns: { id: number; name: string }[],
  close: () => void,
): Promise<CmdItem[]> {
  const items: CmdItem[] = []
  const { dbApi } = await import('~/composables/useDb')
  const eType = matchEntityType(typeWord)

  if (!typeWord || !eType) {
    for (const t of ENTITY_TYPES_CMD) {
      items.push({ kind: 'pick', id: `ren-type-${t.type}`, icon: '↩', label: `rename ${t.label.toLowerCase()} …`, hint: `Rename a ${t.label}`, execute: () => {}, fill: `> rename ${t.label.toLowerCase()} ` })
    }
    return items
  }

  const [namePart, afterPipe] = parsePipe(nameStr)

  if (!ctx.campaign) {
    items.push({ kind: 'cmd', id: 'ren-nocamp', icon: '↩', label: `rename ${eType!.label.toLowerCase()} …`, hint: '', canExecute: false, warning: 'select a campaign' })
    if (campaigns.length) {
      items.push({ kind: 'section', label: 'Select campaign' })
      for (const c of campaigns) items.push({ kind: 'pick', id: `pick-ren-${c.id}`, icon: '📋', label: c.name, hint: 'Set context', execute: () => { _ctx.value.campaign = c; _saveCtx() } })
    }
    return items
  }
  if (afterPipe === null) {
    if (!namePart) {
      items.push({ kind: 'cmd', id: 'ren-noname', icon: '↩', label: `rename ${eType!.label.toLowerCase()} …`, hint: `Search ${eType!.plural}`, canExecute: false, warning: 'type the current name' })
      return items
    }
    const allRows = await dbApi.entities.search(namePart.toLowerCase(), 8)
    const byType = allRows.filter((r: any) => r.type === eType!.type)
    const matches = ctx.campaign
      ? (byType.filter((r: any) => r.campaign_id === ctx.campaign!.id).length
          ? byType.filter((r: any) => r.campaign_id === ctx.campaign!.id)
          : byType)
      : byType
    if (!matches.length) items.push({ kind: 'cmd', id: 'ren-none', icon: '↩', label: `No ${eType!.plural} matching "${namePart}"`, hint: '', canExecute: false })
    for (const r of matches) {
      items.push({ kind: 'pick', id: `ren-pick-${r.id}`, icon: '↩', label: r.name, hint: `Rename · type new name after |`, execute: () => {}, fill: `> rename ${typeWord} ${r.name} | ` })
    }
    return items
  }
  const newName = afterPipe.trim()
  const notesStore = useEntities()
  const allRenRows = await dbApi.entities.search(namePart.toLowerCase(), 8)
  const byRenType = allRenRows.filter((r: any) => r.type === eType!.type)
  const preferredRenRows = ctx.campaign
    ? (byRenType.filter((r: any) => r.campaign_id === ctx.campaign!.id).length
        ? byRenType.filter((r: any) => r.campaign_id === ctx.campaign!.id)
        : byRenType)
    : byRenType
  const renEntityRow = preferredRenRows.find((r: any) => r.name.toLowerCase() === namePart.toLowerCase())
    ?? preferredRenRows[0] ?? null
  const renCampaignHint = renEntityRow?.campaign_id
    ? (campaigns.find(c => c.id === renEntityRow.campaign_id)?.name ?? `Campaign ${renEntityRow.campaign_id}`)
    : ''
  items.push({
    kind: 'cmd', id: 'ren-exec', icon: '↩',
    label: `rename "${namePart}" → "${newName || '…'}"`,
    hint: renEntityRow ? renCampaignHint : `No match for "${namePart}"`,
    canExecute: !!(renEntityRow && newName),
    warning: !renEntityRow ? `no match for "${namePart}"` : !newName ? 'type the new name' : undefined,
    execute: async () => {
      if (!renEntityRow || !newName) return
      await notesStore.updateEntity(renEntityRow.id, { name: newName })
      close()
    },
  })
  return items
}

// ── Dice roller ───────────────────────────────────────────────────────────────
function rollDice(expr: string): { total: number; breakdown: string } | null {
  const parts = expr.toLowerCase().trim().split(/([+-])/)
  let total = 0
  const breakdown: string[] = []
  let sign = 1
  for (const part of parts) {
    if (part === '+') { sign = 1; continue }
    if (part === '-') { sign = -1; continue }
    const m = part.match(/^(\d*)d(\d+)$/)
    if (m) {
      const count = Math.min(parseInt(m[1] || '1'), 100)
      const sides = Math.min(parseInt(m[2]), 10000)
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
      const sub = rolls.reduce((a, b) => a + b, 0)
      total += sign * sub
      breakdown.push(`${sign < 0 ? '-' : ''}[${rolls.join('+')}]`)
    } else if (/^\d+$/.test(part.trim())) {
      const v = parseInt(part)
      total += sign * v
      breakdown.push(`${sign < 0 ? '-' : ''}${v}`)
    } else if (part.trim()) {
      return null
    }
  }
  return { total, breakdown: breakdown.join(' ') }
}

function rollSuggestions(expr: string): CmdItem[] {
  if (!expr.trim()) return [{ kind: 'cmd', id: 'roll-hint', icon: '⚄', label: 'roll [expression]', hint: 'e.g. 2d6+3, d20, 4d6', canExecute: false }]
  const result = rollDice(expr)
  if (!result) return [{ kind: 'cmd', id: 'roll-invalid', icon: '⚄', label: `Invalid expression "${expr}"`, hint: '', canExecute: false }]
  return [{ kind: 'cmd', id: 'roll-result', icon: '⚄', label: `${result.total}`, hint: `${expr} → ${result.breakdown} · Enter to reroll`, canExecute: true, keepOpen: true, execute: () => {} }]
}

function setSuggestions(
  nameRest: string,
  campaigns: { id: number; name: string }[],
  close: () => void,
): CmdItem[] {
  const items: CmdItem[] = []
  const q = nameRest.toLowerCase().trim()

  const matchedCamps = q ? campaigns.filter(c => c.name.toLowerCase().includes(q)) : campaigns

  if (matchedCamps.length) {
    items.push({ kind: 'section', label: 'Set Campaign Context' })
    for (const c of matchedCamps) {
      const active = _ctx.value.campaign?.id === c.id
      items.push({
        kind: 'pick', id: `set-camp-${c.id}`, icon: active ? '✓' : '📋',
        label: c.name, hint: active ? 'Active campaign' : 'Set as campaign context',
        execute: () => { _ctx.value.campaign = { id: c.id, name: c.name }; _saveCtx() },
      })
    }
  }
  if (!matchedCamps.length) {
    items.push({ kind: 'cmd', id: 'set-none', icon: '⚠', label: `No match for "${nameRest}"`, hint: '', canExecute: false })
  }
  return items
}

function unsetSuggestions(rest: string): CmdItem[] {
  const items: CmdItem[] = []
  const r = rest.trim().toLowerCase()
  const hasCamp = !!_ctx.value.campaign

  if (!hasCamp) {
    items.push({ kind: 'cmd', id: 'unset-none', icon: '✕', label: 'No context set', hint: '', canExecute: false })
    return items
  }
  if ((!r || r.includes('campaign') || r.includes('camp')) && hasCamp) {
    items.push({ kind: 'pick', id: 'unset-camp', icon: '✕', label: `Unset campaign (${_ctx.value.campaign!.name})`, hint: 'Remove campaign context', execute: () => { _ctx.value.campaign = null; _saveCtx() } })
  }
  return items
}

function themeSuggestions(rest: string, updateSettings: (k: string, v: any) => void, close: () => void): CmdItem[] {
  const THEMES = ['dark', 'void', 'forest', 'light', 'parchment']
  const q = rest.trim().toLowerCase()
  const matched = q ? THEMES.filter(t => t.startsWith(q)) : THEMES
  return matched.map(t => ({
    kind: 'pick' as const, id: `theme-${t}`, icon: '◐', label: t, hint: `Switch to ${t} theme`,
    execute: () => { updateSettings('theme', t) },
  }))
}

function defaultSuggestions(partialVerb?: string): CmdItem[] {
  const hints = [
    { icon: '→', label: 'goto [section]',              hint: 'Navigate to a section — npcs, graphs, settings…' },
    { icon: '＋', label: 'add [type] [name]',           hint: 'Create a new entity — npc, location, quest…' },
    { icon: '⌕', label: 'find [type] [name]',          hint: 'Find and open an entity or compendium entry' },
    { icon: '✕', label: 'delete [type] [name]',        hint: 'Delete a campaign entity' },
    { icon: '✎', label: 'edit [type] [name] | [key] [value]', hint: 'Set an attribute on an entity or a field on a record' },
    { icon: '¶', label: 'append [type] [name] | [text]', hint: 'Add a paragraph to an entity\'s content or a record\'s text field' },
    { icon: '↩', label: 'rename [type] [name] | [new name]', hint: 'Rename a campaign entity' },
    { icon: '◎', label: 'set [name]',                  hint: 'Set campaign context' },
    { icon: '✕', label: 'unset',                       hint: 'Clear current context' },
    { icon: '◐', label: 'theme [name]',                hint: 'Switch color theme — dark, void, forest, light, parchment' },
    { icon: '⚄', label: 'roll [expression]',           hint: 'Roll dice — 2d6+3, d20, 4d6' },
  ]
  const filtered = partialVerb
    ? hints.filter(h => h.label.startsWith(partialVerb) || h.label.includes(partialVerb))
    : hints
  return filtered.map((h, i) => ({
    kind: 'cmd' as const, id: `hint-${i}`, icon: h.icon, label: h.label, hint: h.hint, canExecute: false,
  }))
}

// ── Exported composable ──────────────────────────────────────────────────────

export function useCommandPalette() {
  const ctx = _ctx

  function setCtx(type: 'campaign', item: { id: number; name: string }) {
    ctx.value[type] = item
    _saveCtx()
  }

  function clearCtx(type?: 'campaign') {
    if (type) ctx.value[type] = null
    else { ctx.value.campaign = null }
    _saveCtx()
  }

  function isCommandMode(query: string): boolean {
    const q = query.trim()
    if (!q) return false
    if (q.startsWith('>')) return true
    const first = q.split(/\s+/)[0].toLowerCase()
    return COMMAND_VERBS.includes(first)
  }

  function rawCommandQuery(query: string): string {
    const q = query.trim()
    return q.startsWith('>') ? q.slice(1).trimStart() : q
  }

  async function getSuggestions(
    rawQuery: string,
    opts: {
      campaigns: { id: number; name: string }[]
      router: any
      updateSettings: (k: string, v: any) => void
      close: () => void
    },
  ): Promise<CmdItem[]> {
    const q = rawCommandQuery(rawQuery).toLowerCase().trim()
    const { campaigns, router, updateSettings, close } = opts


    if (!q) return defaultSuggestions()

    const [verbWord, ...rest] = q.split(/\s+/)
    const restStr = rest.join(' ')
    const [typeWord, ...nameRest] = rest
    const nameStr = nameRest.join(' ')

    // Goto
    if (['goto', 'go', 'navigate', 'nav'].includes(verbWord)) {
      if (!typeWord) {
        const items: CmdItem[] = []
        for (const t of GOTO_TARGETS) {
          items.push(...gotoSuggestions(t, ctx.value, campaigns, router, close))
        }
        return items
      }
      const target = matchGotoTarget(typeWord)
      if (target) return gotoSuggestions(target, ctx.value, campaigns, router, close)
      return [{ kind: 'cmd', id: 'goto-unk', icon: '→', label: `goto ${typeWord}`, hint: `Unknown section "${typeWord}"`, canExecute: false }]
    }

    // Open — ambiguous: try goto first, then find
    if (verbWord === 'open') {
      if (typeWord) {
        const gotoTarget = matchGotoTarget(typeWord)
        if (gotoTarget) return gotoSuggestions(gotoTarget, ctx.value, campaigns, router, close)
        const eType = matchEntityType(typeWord)
        if (eType) return findSuggestions(typeWord, nameStr, ctx.value, campaigns, router, close)
      }
      return defaultSuggestions('o')
    }

    // Add / Create
    if (['add', 'create', 'new'].includes(verbWord)) {
      return addSuggestions(typeWord ?? '', nameStr, ctx.value, campaigns, router, close)
    }

    // Find / Search / Show
    if (['find', 'search', 'show'].includes(verbWord)) {
      return findSuggestions(typeWord ?? '', nameStr, ctx.value, campaigns, router, close)
    }

    // Delete
    if (['delete', 'del', 'remove'].includes(verbWord)) {
      return deleteSuggestions(typeWord ?? '', nameStr, ctx.value, campaigns, close)
    }

    // Edit attribute
    if (['edit', 'update'].includes(verbWord)) {
      return editSuggestions(typeWord ?? '', nameStr, ctx.value, campaigns, close)
    }

    // Append paragraph
    if (['append', 'write'].includes(verbWord)) {
      return appendSuggestions(typeWord ?? '', nameStr, ctx.value, campaigns, close)
    }

    // Rename
    if (verbWord === 'rename') {
      return renameSuggestions(typeWord ?? '', nameStr, ctx.value, campaigns, close)
    }

    // Set
    if (['set', 'use'].includes(verbWord)) {
      return setSuggestions(restStr, campaigns, close)
    }

    // Unset
    if (['unset', 'clear'].includes(verbWord)) {
      return unsetSuggestions(restStr)
    }

    // Theme
    if (verbWord === 'theme') {
      return themeSuggestions(restStr, updateSettings, close)
    }

    // Roll
    if (['roll', 'dice'].includes(verbWord)) {
      return rollSuggestions(restStr)
    }

    // No match — show hints filtered by what they're typing
    return defaultSuggestions(verbWord)
  }

  return { ctx, setCtx, clearCtx, isCommandMode, rawCommandQuery, getSuggestions }
}
