/**
 * Reference check over a whole snapshot: every id a row holds must name a row
 * that exists. Used after the legacy import and by the tests; a non-empty
 * result means the converter forgot a reference.
 */
import type { ActorRef, Owner, Snapshot } from '@/domain/schema'

export function checkReferences(s: Snapshot): string[] {
  const problems: string[] = []
  const ids = <T extends { id: string }>(rows: T[]) => new Set(rows.map(r => r.id))
  const campaigns = ids(s.campaigns), entries = ids(s.entries), encounters = ids(s.encounters), characters = ids(s.characters)
  const actors = ids(s.actors), combatants = ids(s.combatants), inventory = ids(s.inventory), panels = ids(s.sessionPanels)
  const tracks = ids(s.soundTracks), lists = ids(s.soundPlaylists), ledger = ids(s.partyLedger), ships = ids(s.starships)

  const need = (set: Set<string>, id: string | null | undefined, where: string) => {
    if (id !== null && id !== undefined && !set.has(id)) problems.push(`${where} → ${id}`)
  }
  const ref = (r: ActorRef, where: string) => {
    if (r.kind === 'entry') need(entries, r.entryId, `${where}.ref`)
    if (r.kind === 'character') need(characters, r.characterId, `${where}.ref`)
  }
  const owner = (o: Owner, where: string) => {
    if (o.kind === 'character') need(characters, o.id, `${where}.owner`)
    if (o.kind === 'encounter') need(encounters, o.id, `${where}.owner`)
  }

  for (const e of s.entries) {
    need(campaigns, e.campaignId, `entries ${e.id}.campaignId`)
    if (e.type === 'quest') need(entries, e.data.giver.entryId, `entries ${e.id}.giver`)
    if (e.type === 'region') need(entries, e.data.mapEntryId, `entries ${e.id}.mapEntryId`)
  }
  for (const l of s.links) { need(entries, l.sourceId, `links ${l.id}.sourceId`); need(entries, l.targetEntryId, `links ${l.id}.targetEntryId`) }
  for (const v of s.entryVersions) { need(entries, v.entryId, `entryVersions ${v.id}.entryId`); need(entries, v.eventId, `entryVersions ${v.id}.eventId`) }
  for (const p of s.mapPins) { need(entries, p.mapEntryId, `mapPins ${p.id}.mapEntryId`); need(entries, p.entryId, `mapPins ${p.id}.entryId`) }
  for (const g of s.graphs) { need(campaigns, g.campaignId, `graphs ${g.id}.campaignId`); for (const n of g.nodes) need(entries, n.entryId, `graphs ${g.id}.node`) }
  for (const e of s.graphEdges) { need(entries, e.sourceEntryId, `graphEdges ${e.id}.source`); need(entries, e.targetEntryId, `graphEdges ${e.id}.target`) }
  for (const p of s.sessionPanels) {
    need(campaigns, p.campaignId, `sessionPanels ${p.id}.campaignId`)
    need(entries, p.sessionId, `sessionPanels ${p.id}.sessionId`)
    need(panels, p.parentId, `sessionPanels ${p.id}.parentId`)
    need(entries, p.originSessionId, `sessionPanels ${p.id}.originSessionId`)
    if (typeof p.attrs.entryId === 'string') need(entries, p.attrs.entryId, `sessionPanels ${p.id}.attrs.entryId`)
    if (typeof p.attrs.encounterId === 'string') need(encounters, p.attrs.encounterId, `sessionPanels ${p.id}.attrs.encounterId`)
    if (Array.isArray(p.attrs.awardIds)) for (const a of p.attrs.awardIds) need(ledger, String(a), `sessionPanels ${p.id}.attrs.awardIds`)
  }
  for (const e of s.sessionEdges) { need(entries, e.sessionId, `sessionEdges ${e.id}.sessionId`); need(panels, e.sourceId, `sessionEdges ${e.id}.source`); need(panels, e.targetId, `sessionEdges ${e.id}.target`) }
  for (const a of s.actors) ref(a.ref, `actors ${a.id}`)
  for (const e of s.encounters) {
    need(campaigns, e.campaignId, `encounters ${e.id}.campaignId`)
    need(lists, e.playlistId, `encounters ${e.id}.playlistId`)
    if (e.starship && typeof e.starship.shipId === 'string') need(ships, e.starship.shipId, `encounters ${e.id}.starship`)
  }
  for (const m of s.encounterMaps) {
    need(encounters, m.id, `encounterMaps ${m.id}`)
    for (const a of m.areas) if (typeof a.attachedTokenId === 'string') need(combatants, a.attachedTokenId, `encounterMaps ${m.id}.area`)
  }
  for (const c of s.combatants) { need(encounters, c.encounterId, `combatants ${c.id}.encounterId`); need(actors, c.actorId, `combatants ${c.id}.actorId`); ref(c.ref, `combatants ${c.id}`) }
  for (const l of s.combatLog) { need(encounters, l.encounterId, `combatLog ${l.id}.encounterId`); need(combatants, l.combatantId, `combatLog ${l.id}.combatantId`) }
  for (const c of s.characters) { need(campaigns, c.campaignId, `characters ${c.id}.campaignId`); need(entries, c.entryId, `characters ${c.id}.entryId`); need(actors, c.actorId, `characters ${c.id}.actorId`) }
  for (const l of s.partyLedger) {
    need(campaigns, l.campaignId, `partyLedger ${l.id}.campaignId`)
    if (l.kind === 'levelUp') for (const c of l.changes) need(characters, c.characterId, `partyLedger ${l.id}.changes`)
    if (l.kind === 'xpAward') for (const c of l.characterIds) need(characters, c, `partyLedger ${l.id}.characterIds`)
    if (l.kind === 'encounterResolved') {
      need(encounters, l.encounterId, `partyLedger ${l.id}.encounterId`)
      need(ledger, l.xpAwardId, `partyLedger ${l.id}.xpAwardId`)
      for (const c of l.participants) need(characters, c, `partyLedger ${l.id}.participants`)
    }
  }
  for (const i of s.inventory) {
    need(campaigns, i.campaignId, `inventory ${i.id}.campaignId`)
    owner(i.owner, `inventory ${i.id}`)
    need(inventory, i.containerId, `inventory ${i.id}.containerId`)
    need(inventory, i.attachedTo, `inventory ${i.id}.attachedTo`)
  }
  for (const p of s.purses) { need(campaigns, p.campaignId, `purses ${p.id}.campaignId`); owner(p.owner, `purses ${p.id}`) }
  for (const sh of s.starships) {
    need(campaigns, sh.campaignId, `starships ${sh.id}.campaignId`)
    need(encounters, sh.interiorEncounterId, `starships ${sh.id}.interiorEncounterId`)
    for (const c of [...sh.crew, ...sh.presets.flatMap(p => p.crew)]) need(characters, c.characterId, `starships ${sh.id}.crew`)
  }
  for (const p of s.soundPlaylists) for (const t of p.trackIds) need(tracks, t, `soundPlaylists ${p.id}.trackIds`)
  for (const w of s.workspace) if (w.campaignId) need(campaigns, w.campaignId, `workspace ${w.id}.campaignId`)
  return problems
}
