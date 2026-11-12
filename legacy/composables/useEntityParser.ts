export interface EntityRef {
  type: string
  name: string
  metadata: Record<string, string>
  raw: string
  start: number
  end: number
}

export interface ParsedLink {
  type: string
  name: string
  metadata: Record<string, string>
}

const ENTITY_TYPES = ['note', 'npc', 'location', 'faction', 'quest', 'event', 'session', 'encounter', 'graph', 'random-table', 'rumor']

// Alias → canonical type. Allows short names like {{table: ...}} → random-table
const ENTITY_TYPE_ALIASES: Record<string, string> = {
  'table': 'random-table',
}

// Allows apostrophes and other special chars in names — stops at @, |, or }
// Groups: 1=type, 2=name, 3=snapshotLabel (@ sigil, optional), 4=meta (| sigil, optional)
export const ENTITY_REGEX = /\{\{([\w-]+):\s*([^@|}\n]+?)\s*(?:@\s*([^|}\n]+?)\s*)?(?:\|\s*([^}]*))?\}\}/g

function resolveType(raw: string): string {
  const lower = raw.toLowerCase()
  return ENTITY_TYPE_ALIASES[lower] ?? lower
}

function parseMeta(metaStr: string): Record<string, string> {
  const metadata: Record<string, string> = {}
  if (!metaStr) return metadata
  metaStr.split(',').forEach(pair => {
    // support both = and : as separator
    const idx = pair.search(/[=:]/)
    if (idx === -1) return
    const k = pair.slice(0, idx).trim()
    const v = pair.slice(idx + 1).trim()
    if (k) metadata[k] = v
  })
  return metadata
}

export function parseEntityRefs(content: string): EntityRef[] {
  const refs: EntityRef[] = []
  let match: RegExpExecArray | null
  ENTITY_REGEX.lastIndex = 0
  while ((match = ENTITY_REGEX.exec(content)) !== null) {
    const [raw, rawType, name, _snapLabel, metaStr] = match
    const type = resolveType(rawType)
    if (!ENTITY_TYPES.includes(type)) continue
    refs.push({
      type,
      name: name.trim(),
      metadata: parseMeta(metaStr ?? ''),
      raw,
      start: match.index,
      end: match.index + raw.length,
    })
  }
  return refs
}

export function renderEntityRefs(
  html: string,
  entityLookup?: (type: string, name: string) => { imageUrl?: string; iconHtml?: string; color?: string } | null,
  extraTypes?: string[],
  entryRenderer?: (type: string, name: string, attrKey?: string) => string | null,
  snapshotRenderer?: (type: string, name: string, snapshotLabel: string, attrKey?: string) => string | null
): string {
  const allTypes = extraTypes?.length ? [...ENTITY_TYPES, ...extraTypes.map(t => t.toLowerCase())] : ENTITY_TYPES
  return html.replace(ENTITY_REGEX, (raw, rawType, name, snapLabel, metaStr) => {
    const type = resolveType(rawType)
    if (type === 'roll') {
      const expr = name.trim()
      return `<span class="roll-ref" data-roll="${expr}">🎲 ${expr}</span>`
    }
    if (!allTypes.includes(type)) return raw

    // Snapshot rendering: {{npc: Lira @ Before Ascension}} or {{npc: Lira @ Before Ascension | portraitSource}}
    const snapLabelTrimmed = (snapLabel ?? '').trim()
    if (snapshotRenderer && snapLabelTrimmed) {
      const attrKey = (metaStr ?? '').trim() || undefined
      const rendered = snapshotRenderer(type, name.trim(), snapLabelTrimmed, attrKey)
      if (rendered !== null) return rendered
    }

    // Entry rendering: {{npc: Lira | entry}} or {{npc: Lira | entry:portraitSource}}
    const trimmedMeta = (metaStr ?? '').trim()
    if (entryRenderer && (trimmedMeta === 'entry' || trimmedMeta.startsWith('entry:'))) {
      const attrKey = trimmedMeta.startsWith('entry:') ? trimmedMeta.slice(6).trim() : undefined
      const rendered = entryRenderer(type, name.trim(), attrKey)
      if (rendered !== null) return rendered
    }

    const metadata = parseMeta(metaStr ?? '')
    const metaLabel = Object.entries(metadata).map(([k, v]) => `${k}: ${v}`).join(', ')
    const tooltip = metaLabel ? ` (${metaLabel})` : ''
    const extra = entityLookup ? entityLookup(type, name.trim()) : null
    const avatarHtml = extra?.imageUrl
      ? `<img class="entity-ref-avatar" src="${extra.imageUrl}" />`
      : extra?.iconHtml
        ? extra.iconHtml
        : extra
          ? `<span class="entity-ref-dot" style="background:${extra.color ?? '#888'}"></span>`
          : ''
    return `<span class="entity-ref entity-ref--${type}" data-entity-type="${type}" data-entity-name="${name.trim()}" title="${name.trim()}${tooltip}">${avatarHtml}${name.trim()}${metaLabel ? ` <em>${metaLabel}</em>` : ''}</span>`
  })
}

export function extractLinks(content: string): ParsedLink[] {
  return parseEntityRefs(content).map(ref => ({ type: ref.type, name: ref.name, metadata: ref.metadata }))
}
