import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { dbApi, getDb } from '~/composables/useDb'
import { CAMPAIGN_TABLES, exportAllPayload, exportCampaignsPayload, importPayload, jsonBlob, type BackupPayload } from '~/sync/backup'

const ALL = new Set<string>([...CAMPAIGN_TABLES, 'rules', 'rulesOverlays'])

/** A small campaign with every kind of cross-reference the import must remap. */
async function seed(name: string) {
  const db = getDb()
  const id = await db.campaigns.add({ name, description: '', game: 'pf2e', created_at: '', updated_at: '' }) as number
  const loc = await db.entities.add({ campaign_id: id, type: 'location', name: `${name} Keep`, content: '', attributes: '{}', created_at: '', updated_at: '' }) as number
  const npc = await db.entities.add({ campaign_id: id, type: 'npc', name: `${name} Kib`, content: '', attributes: '{"isPlayerCharacter":true}', created_at: '', updated_at: '' }) as number
  await db.entities.update(loc, { attributes: JSON.stringify({ mapPins: [{ entityId: npc, x: 0.5, y: 0.5 }] }) })
  await db.entityLinks.add({ source_id: loc, target_type: 'npc', target_name: `${name} Kib`, metadata: '{}' })
  await db.entityConnections.add({ campaign_id: id, source_entity_id: loc, target_entity_id: npc, label: '', direction: 'none', color: null })
  const token = await db.tokens.add({ name: `${name} token`, image_source: null, image_type: 'file', is_template: 1, is_player_character: 1, linked_entity_id: npc, created_at: '' }) as number
  const enc = await db.encounters.add({ campaign_id: id, name: `${name} fight`, created_at: '', updated_at: '' } as any) as number
  await db.encounterTokens.add({ encounter_id: enc, token_id: token, linked_entity_id: npc } as any)
  await db.encounterWalls.add({ encounter_id: enc, points: '[]', coverType: 'full', isOpen: false })
  const chr = await db.characters.add({ campaign_id: id, name: 'Kib', role: 'pc', level: 1, xp: 0, treat_as_pc: 1, str_mod: null, npc_entity_id: npc, token_id: token, created_at: '', updated_at: '' }) as number
  const xp = await db.xpAwards.add({ campaign_id: id, at: '', source: 'encounter', ref_type: 'encounter', ref_id: enc, amount: 80, character_ids: JSON.stringify([chr]), reason: '' }) as number
  await db.encounters.update(enc, { status: 'resolved', resolution: JSON.stringify({ loot: { entries: [], cp: 0 }, participants: [chr], xpAwardId: xp, accomplishment: 0 }) })
  const bag = await db.inventory.add({ campaign_id: id, owner: `character:${chr}`, item_id: null, quantity: 1, name_override: 'Bag', notes: '', identified: 1 } as any) as number
  await db.inventory.add({ campaign_id: id, owner: `character:${chr}`, item_id: null, quantity: 2, name_override: 'Potion', notes: '', identified: 1, container_id: bag } as any)
  await db.purses.add({ campaign_id: id, owner: `encounter:${enc}`, cp: 50, updated_at: '' })
  return { id, loc, npc, token, enc, chr, xp }
}

async function readBack(payload: BackupPayload): Promise<BackupPayload> {
  return JSON.parse(await jsonBlob(payload).text())
}

describe('backup and import', () => {
  beforeEach(async () => {
    const db = getDb()
    await Promise.all([...CAMPAIGN_TABLES.map(t => db.table(t).clear()), db.rules.clear(), db.images.clear()])
  })

  it('writes a JSON file that parses back to the same rows', async () => {
    await seed('Codex')
    const payload = await exportAllPayload()
    const back = await readBack(payload)
    for (const t of CAMPAIGN_TABLES) expect(back[t]).toEqual(payload[t])
    expect(back.type).toBe('all')
  })

  it('merges a campaign file into a non-empty database without touching existing rows', async () => {
    const theirs = await seed('Theirs')
    const file = await readBack(await exportCampaignsPayload([theirs.id]))
    expect(file.tokens).toHaveLength(1)

    // Another browser: wipe, then make an unrelated campaign that reuses the same ids
    const db = getDb()
    await Promise.all(CAMPAIGN_TABLES.map(t => db.table(t).clear()))
    const mine = await seed('Mine')
    const before = await db.campaigns.get(mine.id)

    const result = await importPayload(file, { mode: 'merge', sections: ALL })
    expect(result.counts.campaigns).toBe(1)
    expect(await db.campaigns.get(mine.id)).toEqual(before)
    expect(await db.campaigns.count()).toBe(2)

    const imported = (await db.campaigns.toArray()).find(c => c.name === 'Theirs')!
    const ents = await db.entities.where('campaign_id').equals(imported.id!).toArray()
    const npc = ents.find(e => e.type === 'npc')!
    const loc = ents.find(e => e.type === 'location')!
    expect(JSON.parse(loc.attributes).mapPins[0].entityId).toBe(npc.id)
    expect((await db.entityLinks.where('source_id').equals(loc.id!).toArray())).toHaveLength(1)
    expect((await db.entityConnections.where('campaign_id').equals(imported.id!).first())).toMatchObject({ source_entity_id: loc.id, target_entity_id: npc.id })

    const enc = await db.encounters.where('campaign_id').equals(imported.id!).first()
    const placed = await db.encounterTokens.where('encounter_id').equals(enc!.id!).first()
    const token = await db.tokens.get(placed!.token_id!)
    expect(token).toMatchObject({ name: 'Theirs token', linked_entity_id: npc.id })
    expect(placed!.linked_entity_id).toBe(npc.id)
    expect(await db.encounterWalls.where('encounter_id').equals(enc!.id!).count()).toBe(1)

    const chr = await db.characters.where('campaign_id').equals(imported.id!).first()
    expect(chr).toMatchObject({ npc_entity_id: npc.id, token_id: token!.id })
    const award = await db.xpAwards.where('campaign_id').equals(imported.id!).first()
    expect(award).toMatchObject({ ref_id: enc!.id, character_ids: JSON.stringify([chr!.id]) })
    expect(JSON.parse(enc!.resolution!)).toMatchObject({ participants: [chr!.id], xpAwardId: award!.id })

    const items = await db.inventory.where('campaign_id').equals(imported.id!).toArray()
    const bag = items.find(i => i.name_override === 'Bag')!
    expect(items.map(i => i.owner)).toEqual([`character:${chr!.id}`, `character:${chr!.id}`])
    expect(items.find(i => i.name_override === 'Potion')!.container_id).toBe(bag.id)
    expect(await db.purses.where('campaign_id').equals(imported.id!).first()).toMatchObject({ owner: `encounter:${enc!.id}`, cp: 50 })
  })

  it('replaces everything with a full backup, keeping its ids', async () => {
    const theirs = await seed('Theirs')
    const file = await readBack(await exportAllPayload())
    const db = getDb()
    await Promise.all(CAMPAIGN_TABLES.map(t => db.table(t).clear()))
    await seed('Mine')
    await seed('Mine too')

    await importPayload(file, { mode: 'replace', sections: ALL })
    expect((await db.campaigns.toArray()).map(c => c.name)).toEqual(['Theirs'])
    expect((await db.campaigns.get(theirs.id))!.name).toBe('Theirs')
    expect(await db.entities.count()).toBe(2)
  })

  it('changes nothing when an import fails halfway', async () => {
    await seed('Mine')
    const db = getDb()
    const before = await Promise.all(CAMPAIGN_TABLES.map(t => db.table(t).count()))
    // Valid campaigns, then an entity whose key IndexedDB rejects: the clear and the writes roll back
    const bad = {
      version: 1, app: 'startome', type: 'all', exportedAt: '',
      campaigns: [{ id: 99, name: 'Broken', description: '', created_at: '', updated_at: '' }],
      entities: [{ id: { not: 'a key' }, campaign_id: 99, type: 'npc', name: 'x', content: '', attributes: '{}' }],
    } as unknown as BackupPayload
    await expect(importPayload(bad, { mode: 'replace', sections: ALL })).rejects.toThrow()
    expect(await Promise.all(CAMPAIGN_TABLES.map(t => db.table(t).count()))).toEqual(before)
    expect((await db.campaigns.toArray()).map(c => c.name)).toEqual(['Mine'])
  })

  it('clones a campaign with shared library tokens and remapped owners', async () => {
    const c = await seed('Codex')
    const copy = await dbApi.campaigns.clone(c.id)
    const db = getDb()
    expect(copy!.name).toBe('Codex (Copy)')
    expect(await db.tokens.count()).toBe(1)
    const enc = await db.encounters.where('campaign_id').equals(copy!.id!).first()
    expect(enc!.resolution).toBeNull()
    expect((await db.encounterTokens.where('encounter_id').equals(enc!.id!).first())!.token_id).toBe(c.token)
    expect(await db.xpAwards.where('campaign_id').equals(copy!.id!).count()).toBe(0)
  })

  it('stores imported maps as images and puts them back inline on export', async () => {
    const db = getDb()
    const map = 'data:image/png;base64,iVBORw0KGgo='
    const file = {
      version: 1, app: 'dmstome', type: 'campaigns', exportedAt: '',
      campaigns: [{ id: 7, name: 'Old', description: '', created_at: '', updated_at: '' }],
      encounters: [{ id: 3, campaign_id: 7, name: 'Cave', map_source: map, map_type: 'file', created_at: '', updated_at: '' }],
    } as unknown as BackupPayload
    await importPayload(file, { mode: 'merge', sections: ALL })
    const enc = (await db.encounters.toArray())[0]
    expect(enc.map_source).toMatch(/^img:/)
    expect(await db.images.get(enc.map_source!.slice(4))).toBeDefined()
    const out = await exportCampaignsPayload([enc.campaign_id])
    expect(out.encounters![0].map_source).toBe(map)
    expect((await db.encounters.get(enc.id!))!.map_source).toMatch(/^img:/)
  })

  it('keeps encounter maps when cleaning up unused images', async () => {
    const { cleanUpUnusedImages, storeImage, dataUrlToBlob } = await import('~/rules/images')
    const db = getDb()
    const c = await seed('Codex')
    const ref = await storeImage(dataUrlToBlob('data:image/png;base64,iVBORw0KGgo='))
    await db.encounters.update(c.enc, { map_source: ref })
    await storeImage(dataUrlToBlob('data:image/png;base64,AAAA'))
    expect(await cleanUpUnusedImages()).toBe(1)
    expect(await db.images.get(ref.slice(4))).toBeDefined()
  })

  it('moves a new map out of the row when an encounter is saved', async () => {
    const db = getDb()
    const c = await seed('Codex')
    await dbApi.encounters.update({ id: c.enc, map_source: 'data:image/png;base64,iVBORw0KGgo=' })
    expect((await db.encounters.get(c.enc))!.map_source).toMatch(/^img:/)
  })
})
