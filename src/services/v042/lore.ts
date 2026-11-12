/** Legacy conversion, part 1: campaigns, entries, links, history, pins, graphs, session boards. */
import { DEFAULT_GAME, isGameId } from '@/domain/game'
import { ENTRY_TYPES, PANEL_KINDS, type EntryType } from '@/domain/schema'
import { arr, bool, dropped, imageRef, iso, mapped, note, num, numOrNull, obj, oneOf, push, rowsOf, str, strOrNull, tally, type Ctx, type Row } from './context'

/** The attribute keys each type's `data` takes over; everything else goes to `extra`. */
const KNOWN: Record<EntryType, string[]> = {
  npc: ['portraitSource', 'portraitType', 'title', 'level', 'race', 'role', 'role2', 'status', 'isAlive', 'isPlayerCharacter'],
  location: ['imageSource', 'imageType', 'logoSource', 'logoType', 'locationType', 'status', 'mapPins'],
  faction: ['imageSource', 'imageType', 'factionType', 'size', 'isSecret', 'headquartersName'],
  quest: ['status', 'questGiver', 'questGiverId', 'questGiverType', 'reward', 'milestone', 'tags'],
  event: ['date', 'location', 'significance'],
  session: ['mode', 'sessionNumber', 'date', 'board', 'scriptContent', 'notesContent', 'panels'],
  note: ['icon', 'tags'],
  'random-table': ['die', 'rows', 'tags'],
  rumor: ['statuses', 'source', 'tags'],
  region: ['locationEntityId', 'polygon', 'color'],
}

function extraOf(type: EntryType, a: Row): Row {
  const known = new Set(KNOWN[type])
  return Object.fromEntries(Object.entries(a).filter(([k, v]) => !known.has(k) && v !== undefined && v !== null && v !== ''))
}

/** An entry's (or a historical state's) attributes as the typed `data` of its type. */
export function entryData(ctx: Ctx, type: EntryType, a: Row): Row {
  const extra = extraOf(type, a)
  switch (type) {
    case 'npc': return {
      portrait: imageRef(ctx, a.portraitSource), title: str(a.title), level: str(a.level), ancestry: str(a.race), class: str(a.role),
      class2: str(a.role2), status: str(a.status), alive: a.isAlive !== false, extra,
    }
    case 'location': return {
      map: imageRef(ctx, a.imageSource), banner: imageRef(ctx, a.logoSource),
      kind: oneOf(a.locationType, ['city', 'dungeon', 'wilderness', 'building', 'region', 'other']),
      status: oneOf(a.status, ['discovered', 'undiscovered', 'destroyed']), extra,
    }
    case 'faction': return {
      image: imageRef(ctx, a.imageSource), kind: oneOf(a.factionType, ['criminal', 'religious', 'political', 'mercenary', 'arcane', 'other']),
      size: oneOf(a.size, ['small', 'medium', 'large', 'massive']), secret: bool(a.isSecret), headquarters: str(a.headquartersName), extra,
    }
    case 'quest': return {
      status: oneOf(a.status, ['active', 'completed', 'failed', 'dormant']) ?? 'active',
      giver: { entryId: mapped(ctx.map.ent, a.questGiverId), kind: oneOf(a.questGiverType, ['npc', 'faction']), name: str(a.questGiver) },
      reward: str(a.reward), milestone: bool(a.milestone), extra,
    }
    case 'event': return { date: str(a.date), location: str(a.location), significance: oneOf(a.significance, ['minor', 'major', 'critical']), extra }
    case 'session': {
      const vp = obj(obj(a.board).viewport)
      return {
        mode: oneOf(a.mode, ['planning', 'running', 'finished']) ?? 'planning', number: str(a.sessionNumber), date: str(a.date),
        viewport: { x: num(vp.x, 40), y: num(vp.y, 40), zoom: num(vp.zoom, 0.9) }, extra,
      }
    }
    case 'note': return { icon: str(a.icon), extra }
    case 'random-table': return {
      die: oneOf(a.die, ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']) ?? 'd20',
      rows: arr(a.rows).map(obj).map(r => ({ min: num(r.min, 1), max: num(r.max, 1), result: str(r.result) })), extra,
    }
    case 'rumor': return {
      statuses: arr(a.statuses).map(s => oneOf(s, ['unheard', 'heard', 'revealed', 'false'])).filter(s => s !== null),
      source: str(a.source), extra,
    }
    case 'region': return {
      mapEntryId: mapped(ctx.map.ent, a.locationEntityId),
      polygon: arr(a.polygon).map(obj).map(p => ({ x: num(p.x), y: num(p.y) })), color: str(a.color, '#5fc98a'), extra,
    }
  }
}

export function convertCampaigns(ctx: Ctx): void {
  for (const c of rowsOf(ctx, 'campaigns')) {
    tally(ctx, 'campaigns').read++
    const id = mapped(ctx.map.camp, c.id)
    if (!id) { dropped(ctx, 'campaigns', c, 'it has no id'); continue }
    const pb = obj(c.playbuddy)
    push(ctx, 'campaigns', {
      id, name: str(c.name, 'Untitled campaign'), description: str(c.description),
      game: isGameId(c.game) ? c.game : DEFAULT_GAME, banner: imageRef(ctx, c.banner_source),
      rules: obj(c.rules),
      characterLink: typeof pb.gameId === 'string' ? { provider: 'playbuddy', gameId: pb.gameId, gameName: str(pb.gameName), lastSeq: num(pb.lastSeq) } : null,
      createdAt: iso(c.created_at, ctx.now), updatedAt: iso(c.updated_at, ctx.now),
    })
    tally(ctx, 'campaigns').converted++
  }
}

const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/

/** A session from before the board: its prep split at headings into scenes, its notes as one log. */
function boardFromOldSession(ctx: Ctx, a: Row, content: string, campaignId: string, sessionId: string, ts: string): string {
  const played = a.mode === 'running' || a.mode === 'finished'
  const base = { campaignId, sessionId, originSessionId: sessionId, createdAt: ts, updatedAt: ts, tags: [] }
  const sections: { title: string; body: string[] }[] = []
  const preamble: string[] = []
  let inFence = false
  for (const line of str(a.scriptContent).split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const m = !inFence ? HEADING.exec(line) : null
    const last = sections[sections.length - 1]
    if (m?.[2]) sections.push({ title: m[2], body: [] })
    else if (last) last.body.push(line)
    else preamble.push(line)
  }
  const trim = (lines: string[]) => lines.join('\n').replace(/^(\s*(-{3,}|\*{3,})?\s*\n)+/, '').replace(/(\n\s*(-{3,}|\*{3,})?\s*)+$/, '').trim()
  const made: { id: string; kind: string; title: string; body: string }[] = []
  const add = (p: Row & { kind: string; title: string; body: string }) => {
    const id = ctx.ids()
    made.push({ id, kind: p.kind, title: p.title, body: p.body })
    push(ctx, 'sessionPanels', { ...base, attrs: {}, ...p, id })
  }
  const pre = trim(preamble)
  const rowY = pre ? 220 : 0
  if (pre) add({ kind: 'note', title: 'Prep', body: pre, x: 0, y: 0 })
  sections.forEach((sec, i) => add({ kind: 'scene', title: sec.title, body: trim(sec.body), status: played ? 'played' : 'planned', x: i * 300, y: rowY }))
  const notes = str(a.notesContent ?? content).trim()
  if (notes) add({ kind: 'log', title: 'Notes (from the old editor)', body: notes, attrs: { logType: 'happened', at: ts }, x: 0, y: rowY + (sections.length ? 260 : 0) })
  // Panels written by hand in a campaign file (CAMPAIGN_FORMAT.md), four to a row below the rest
  const fileTop = made.length ? rowY + 540 : 0
  arr(a.panels).map(obj).forEach((f, i) => {
    const kind = oneOf(f.kind, ['scene', 'beat', 'clue', 'log', 'note', 'reward']) ?? 'note'
    const attrs: Row = {}
    if (kind === 'log') Object.assign(attrs, { logType: oneOf(f.logType, ['happened', 'changed', 'improvised', 'consequence']) ?? 'happened', at: ts }, f.playersShouldKnow ? { playersShouldKnow: true } : {})
    if (kind === 'reward' && typeof f.xp === 'number') attrs.xp = f.xp
    add({ kind, title: str(f.title), body: str(f.content), status: strOrNull(f.status), attrs, tags: arr(f.tags).map(t => str(t)), x: (i % 4) * 290, y: fileTop + Math.floor(i / 4) * 240 })
  })
  const scenes = made.filter(p => p.kind === 'scene')
  scenes.slice(1).forEach((p, i) => {
    const from = scenes[i]
    if (from) push(ctx, 'sessionEdges', { id: ctx.ids(), sessionId, sourceId: from.id, targetId: p.id, kind: 'plan', label: '' })
  })
  return made.map(p => [p.title ? `## ${p.title}` : '', p.body].filter(Boolean).join('\n\n')).filter(Boolean).join('\n\n')
}

export function convertEntries(ctx: Ctx): void {
  for (const e of rowsOf(ctx, 'entities')) {
    const t = tally(ctx, 'entities'); t.read++
    const id = mapped(ctx.map.ent, e.id)
    const campaignId = mapped(ctx.map.camp, e.campaign_id)
    const type = oneOf(e.type, ENTRY_TYPES)
    if (!id || !campaignId) { dropped(ctx, 'entities', e, 'its campaign is not in the file'); continue }
    if (!type) { dropped(ctx, 'entities', e, `unknown type “${str(e.type)}”`); continue }
    const a = obj(e.attributes)
    const ts = iso(e.updated_at, ctx.now)
    let body = str(e.content)
    if (type === 'session') {
      const board = obj(a.board)
      if (board.migrated) {
        for (const edge of arr(board.edges).map(obj)) {
          const sourceId = ctx.panel.get(str(edge.source)), targetId = ctx.panel.get(str(edge.target))
          if (sourceId && targetId) push(ctx, 'sessionEdges', { id: ctx.ids(), sessionId: id, sourceId, targetId, kind: oneOf(edge.kind, ['plan', 'sequence', 'attach']) ?? 'plan', label: str(edge.label) })
        }
      } else {
        body = boardFromOldSession(ctx, a, body, campaignId, id, ts)
      }
    }
    push(ctx, 'entries', {
      id, campaignId, type, name: str(e.name, 'Untitled'), body, tags: arr(a.tags).map(x => str(x)).filter(Boolean),
      favorite: bool(e.is_favorite), data: entryData(ctx, type, a), createdAt: iso(e.created_at, ts), updatedAt: ts,
    })
    t.converted++
    if (type === 'location') {
      for (const p of arr(a.mapPins).map(obj)) {
        const entryId = mapped(ctx.map.ent, p.entityId)
        if (entryId) push(ctx, 'mapPins', { id: ctx.ids(), campaignId, mapEntryId: id, entryId, x: num(p.x), y: num(p.y), hidden: bool(p.hidden) })
        else note(ctx, `Map of “${str(e.name)}”: a pin pointed at an entry that no longer exists and was left out`)
      }
    }
  }
}

const TYPE_ALIASES: Record<string, string> = { table: 'random-table' }

export function convertLinks(ctx: Ctx): void {
  // Entry names per campaign and type, as links name their targets
  const byName = new Map<string, string>()
  for (const e of rowsOf(ctx, 'entities')) {
    const id = mapped(ctx.map.ent, e.id)
    if (id) byName.set(`${num(e.campaign_id)}|${str(e.type)}|${str(e.name).trim().toLowerCase()}`, id)
  }
  for (const l of rowsOf(ctx, 'entityLinks')) {
    const t = tally(ctx, 'entityLinks'); t.read++
    const sourceId = mapped(ctx.map.ent, l.source_id)
    if (!sourceId) { t.dropped++; continue }
    const raw = str(l.target_type).toLowerCase()
    const targetType = TYPE_ALIASES[raw] ?? raw
    const campaign = ctx.entCampaign.get(num(l.source_id))
    const meta = Object.fromEntries(Object.entries(obj(l.metadata)).map(([k, v]) => [k, str(v)]))
    push(ctx, 'links', {
      id: ctx.ids(), sourceId, targetType, targetName: str(l.target_name),
      targetEntryId: byName.get(`${campaign}|${targetType}|${str(l.target_name).trim().toLowerCase()}`) ?? null, meta,
    })
    t.converted++
  }
  for (const s of rowsOf(ctx, 'entitySnapshots')) {
    const t = tally(ctx, 'entitySnapshots'); t.read++
    const entryId = mapped(ctx.map.ent, s.entity_id)
    const type = oneOf(ctx.entType.get(num(s.entity_id)), ENTRY_TYPES)
    if (!entryId || !type) { dropped(ctx, 'entitySnapshots', s, 'its entry is not in the file'); continue }
    push(ctx, 'entryVersions', {
      id: ctx.ids(), entryId, label: str(s.label), note: str(s.note), name: str(s.name), body: str(s.content),
      data: entryData(ctx, type, obj(s.attributes)), eventId: mapped(ctx.map.ent, s.event_id), createdAt: iso(s.created_at, ctx.now),
    })
    t.converted++
  }
}

export function convertGraphs(ctx: Ctx): void {
  for (const c of rowsOf(ctx, 'entityConnections')) {
    const t = tally(ctx, 'entityConnections'); t.read++
    const campaignId = mapped(ctx.map.camp, c.campaign_id)
    const sourceEntryId = mapped(ctx.map.ent, c.source_entity_id), targetEntryId = mapped(ctx.map.ent, c.target_entity_id)
    if (!campaignId || !sourceEntryId || !targetEntryId) { dropped(ctx, 'entityConnections', c, 'one of its ends no longer exists'); continue }
    push(ctx, 'graphEdges', {
      id: ctx.ids(), campaignId, sourceEntryId, targetEntryId, label: str(c.label),
      direction: oneOf(c.direction, ['one-way', 'two-way', 'none']) ?? 'none', color: strOrNull(c.color),
      style: oneOf(c.edgeType, ['default', 'straight', 'step', 'smoothstep']) ?? 'default',
    })
    t.converted++
  }
  for (const g of rowsOf(ctx, 'graphLayouts')) {
    const t = tally(ctx, 'graphLayouts'); t.read++
    const id = mapped(ctx.map.graph, g.id), campaignId = mapped(ctx.map.camp, g.campaign_id)
    if (!id || !campaignId) { dropped(ctx, 'graphLayouts', g, 'its campaign is not in the file'); continue }
    const hidden = new Set(arr(g.player_hidden_nodes).map(n => numOrNull(n)))
    const nodes = Object.entries(obj(g.positions)).flatMap(([key, pos]) => {
      const entryId = mapped(ctx.map.ent, key)
      const p = obj(pos)
      return entryId ? [{ entryId, x: num(p.x), y: num(p.y), playerHidden: hidden.has(Number(key)), hiddenAttrs: [] }] : []
    })
    push(ctx, 'graphs', { id, campaignId, name: str(g.name, 'Graph'), nodes, viewport: { x: num(g.pan_x), y: num(g.pan_y), zoom: num(g.zoom, 1) } })
    t.converted++
  }
}

/** Panels of sessions that already have a board. Runs before the entries, which need the panel ids for their edges. */
export function convertPanels(ctx: Ctx): void {
  const rows = rowsOf(ctx, 'sessionPanels')
  for (const p of rows) if (typeof p.uid === 'string') ctx.panel.set(p.uid, ctx.ids())
  for (const p of rows) {
    const t = tally(ctx, 'sessionPanels'); t.read++
    const id = ctx.panel.get(str(p.uid)), campaignId = mapped(ctx.map.camp, p.campaign_id)
    const kind = oneOf(p.kind, PANEL_KINDS)
    if (!id || !campaignId || !kind) { dropped(ctx, 'sessionPanels', p, 'its campaign is not in the file or its kind is unknown'); continue }
    const { entityId, entityType, encounterId, awardIds, ...rest } = obj(p.attrs)
    const attrs: Row = { ...rest }
    if (entityId !== undefined) { attrs.entryId = mapped(ctx.map.ent, entityId); attrs.entryType = entityType ?? null }
    if (encounterId !== undefined) attrs.encounterId = mapped(ctx.map.enc, encounterId)
    if (awardIds !== undefined) attrs.awardIds = arr(awardIds).map(a => mapped(ctx.map.xp, a)).filter(Boolean)
    const ts = iso(p.updated_at, ctx.now)
    push(ctx, 'sessionPanels', {
      id, campaignId, sessionId: mapped(ctx.map.ent, p.session_id), kind, title: str(p.title), body: str(p.content), status: strOrNull(p.status),
      attrs, tags: arr(p.tags).map(x => str(x)), x: num(p.x), y: num(p.y), w: numOrNull(p.w), h: numOrNull(p.h),
      parentId: typeof p.parent_uid === 'string' ? ctx.panel.get(p.parent_uid) ?? null : null,
      originSessionId: mapped(ctx.map.ent, p.origin_session_id), createdAt: iso(p.created_at, ts), updatedAt: ts,
    })
    t.converted++
  }
}
