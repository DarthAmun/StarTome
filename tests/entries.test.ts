import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { extractRefs, renameRefs, uniqueName } from '@/domain/links'
import { StarTomeDb, getDb, useDbForTests } from '@/data/db'
import { createEntry, deleteEntry, saveEntry, versions } from '@/data/entries'

let n = 0
beforeEach(() => { useDbForTests(new StarTomeDb(`entries-${++n}`)) })
const C = 'camp-1'
const links = (id: string) => getDb().rows('links').where('sourceId').equals(id).toArray()

describe('references in text', () => {
  it('finds each reference once, with aliases and options, and skips rolls', () => {
    expect(extractRefs('{{npc: Kib}} meets {{NPC:  kib }} at {{location: The Keep | entry}}; roll {{roll: 2d6}} on {{table: Weather}}')).toEqual([
      { type: 'npc', name: 'Kib', meta: {} }, { type: 'location', name: 'The Keep', meta: { entry: '1' } }, { type: 'random-table', name: 'Weather', meta: {} },
    ])
  })

  it('renames only the named target and keeps what else was written', () => {
    const text = '{{npc: Kib}}, {{npc:kib | entry}}, {{npc: Kibble}}, {{location: Kib}}, {{npc: Kib @ Before}}'
    expect(renameRefs(text, 'npc', 'Kib', 'Kib the Bold')).toBe('{{npc: Kib the Bold}}, {{npc:Kib the Bold | entry}}, {{npc: Kibble}}, {{location: Kib}}, {{npc: Kib the Bold @ Before}}')
  })

  it('gives new entries a free name', () => {
    expect(uniqueName('New NPC', [])).toBe('New NPC')
    expect(uniqueName('New NPC', ['new npc', 'New NPC 2'])).toBe('New NPC 3')
  })
})

describe('entry writes', () => {
  it('creates typed entries with defaults and unique names', async () => {
    const a = await createEntry(C, 'npc'), b = await createEntry(C, 'npc')
    expect([a.name, b.name]).toEqual(['New NPC', 'New NPC 2'])
    expect(a.type === 'npc' && a.data).toMatchObject({ alive: true, portrait: null })
    const region = await createEntry(C, 'region', 'Old Town')
    expect(region.type === 'region' && region.data.mapEntryId).toBeNull()
  })

  it('saving text records its links, resolved by name within the campaign', async () => {
    const keep = await createEntry(C, 'location', 'Keep')
    await createEntry('other-campaign', 'npc', 'Kib')
    const kib = await createEntry(C, 'npc', 'Kib')
    await saveEntry(kib.id, { body: 'Lives in {{location: keep}}, fears {{creature: Goblin}} and {{npc: Nobody}}.' })
    expect((await links(kib.id)).map(l => [l.targetType, l.targetName, l.targetEntryId])).toEqual([
      ['location', 'keep', keep.id], ['creature', 'Goblin', null], ['npc', 'Nobody', null],
    ])
  })

  it('a link written before its target exists resolves when the target is created', async () => {
    const note = await createEntry(C, 'note', 'Plans')
    await saveEntry(note.id, { body: 'Ask {{npc: Mara}}.' })
    const mara = await createEntry(C, 'npc', 'Mara')
    expect((await links(note.id))[0]?.targetEntryId).toBe(mara.id)
  })

  it('renaming an entry rewrites the texts that name it: bodies, quest rewards, table rows, quest givers', async () => {
    const kib = await createEntry(C, 'npc', 'Kib')
    const note = await createEntry(C, 'note', 'Plans')
    await saveEntry(note.id, { body: 'Ask {{npc: Kib | entry}} first.' })
    const quest = await createEntry(C, 'quest', 'Seal')
    await saveEntry(quest.id, { data: { reward: 'A favour from {{npc: Kib}}', giver: { entryId: kib.id, kind: 'npc', name: 'Kib' } } })
    const table = await createEntry(C, 'random-table', 'Who')
    await saveEntry(table.id, { data: { rows: [{ min: 1, max: 20, result: '{{npc: Kib}} appears' }] } })

    await saveEntry(kib.id, { name: 'Kib the Bold' })
    const db = getDb()
    expect((await db.rows('entries').get(note.id))?.body).toBe('Ask {{npc: Kib the Bold | entry}} first.')
    const q = await db.rows('entries').get(quest.id)
    expect(q?.type === 'quest' && [q.data.reward, q.data.giver.name]).toEqual(['A favour from {{npc: Kib the Bold}}', 'Kib the Bold'])
    const t = await db.rows('entries').get(table.id)
    expect(t?.type === 'random-table' && t.data.rows[0]?.result).toBe('{{npc: Kib the Bold}} appears')
    expect((await links(note.id))[0]).toMatchObject({ targetName: 'Kib the Bold', targetEntryId: kib.id })
  })

  it('data is merged, so a save of one field keeps the others', async () => {
    const kib = await createEntry(C, 'npc', 'Kib')
    await saveEntry(kib.id, { data: { title: 'Scout' } })
    await saveEntry(kib.id, { data: { level: '7' } })
    const e = await getDb().rows('entries').get(kib.id)
    expect(e?.type === 'npc' && e.data).toMatchObject({ title: 'Scout', level: '7', alive: true })
    await expect(saveEntry(kib.id, { data: { alive: 'yes' } })).rejects.toThrow()
  })

  it('deleting an entry clears what pointed at it and keeps the text that named it', async () => {
    const db = getDb()
    const keep = await createEntry(C, 'location', 'Keep'), kib = await createEntry(C, 'npc', 'Kib')
    await saveEntry(keep.id, { body: 'Home of {{npc: Kib}}.' })
    const region = await createEntry(C, 'region', 'Yard')
    await saveEntry(region.id, { data: { mapEntryId: keep.id } })
    await db.rows('mapPins').put({ id: 'p1', campaignId: C, mapEntryId: keep.id, entryId: kib.id, x: 0, y: 0, hidden: false })
    await db.rows('graphs').put({ id: 'g1', campaignId: C, name: 'G', nodes: [{ entryId: kib.id, x: 0, y: 0, playerHidden: false, hiddenAttrs: [] }, { entryId: keep.id, x: 1, y: 1, playerHidden: false, hiddenAttrs: [] }], viewport: { x: 0, y: 0, zoom: 1 } })
    await db.rows('graphEdges').put({ id: 'e1', campaignId: C, sourceEntryId: kib.id, targetEntryId: keep.id, label: '', direction: 'none', color: null, style: 'default' })
    await versions.record(kib.id, 'Young', '')

    await deleteEntry(kib.id)
    expect(await db.rows('entries').get(kib.id)).toBeUndefined()
    expect((await db.rows('entries').get(keep.id))?.body).toBe('Home of {{npc: Kib}}.')
    expect((await links(keep.id))[0]?.targetEntryId).toBeNull()
    expect(await db.rows('mapPins').count()).toBe(0)
    expect((await db.rows('graphs').get('g1'))?.nodes.map(x => x.entryId)).toEqual([keep.id])
    expect(await db.rows('graphEdges').count()).toBe(0)
    expect(await db.rows('entryVersions').count()).toBe(0)

    await deleteEntry(keep.id)
    const r = await db.rows('entries').get(region.id)
    expect(r?.type === 'region' && r.data.mapEntryId).toBeNull()
  })

  it('history: record a state, restore it, and the present before the restore is kept', async () => {
    const kib = await createEntry(C, 'npc', 'Kib')
    await saveEntry(kib.id, { body: 'young', data: { title: 'Urchin' } })
    const v = await versions.record(kib.id, 'Before the fire', 'why')
    await saveEntry(kib.id, { body: 'old', data: { title: 'Captain' } })
    await versions.restore(v!.id)
    const e = await getDb().rows('entries').get(kib.id)
    expect(e?.body).toBe('young')
    expect(e?.type === 'npc' && e.data.title).toBe('Urchin')
    const all = await versions.of(kib.id)
    expect(all.map(x => x.label)).toEqual(['Before the fire', 'Before restoring “Before the fire”'])
    expect(all[1]?.body).toBe('old')
  })
})
