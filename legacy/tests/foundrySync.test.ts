import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '~/composables/useDb'
import { rulesGet, rulesUpdate } from '~/composables/useRules'
import { CONVERTER_VERSION, type FoundryDoc } from '~/converters/foundry'
import { openReleaseZip, runFoundrySync } from '~/sync/foundrySync'
import type { Creature, Item } from '~/types/rules'

const dir = fileURLToPath(new URL('./fixtures/foundry/', import.meta.url))
const fixtures: { game: string; pack: string; doc: FoundryDoc }[] = JSON.parse(readFileSync(`${dir}docs.json`, 'utf8'))
const context = JSON.parse(readFileSync(`${dir}context.json`, 'utf8'))

const pf2e = (pack: string) => fixtures.filter(f => f.game === 'pf2e' && f.pack === pack).map(f => structuredClone(f.doc))

/** A miniature pf2e json-assets.zip built from the fixtures. */
async function releaseZip(edit?: (packs: Record<string, FoundryDoc[]>) => void, version = '8.6.1') {
  const packs: Record<string, FoundryDoc[]> = {
    conditions: pf2e('conditions'),
    equipment: pf2e('equipment'),
    'pathfinder-monster-core': pf2e('pathfinder-monster-core'),
    spells: pf2e('spells'),
    'spell-effects': [{ _id: 'x', name: 'Spell Effect: Bless', type: 'effect', system: {} }],
  }
  edit?.(packs)
  for (const docs of Object.values(packs)) for (const d of docs) if (d._stats) d._stats.systemVersion = version
  const zip = new JSZip()
  for (const [name, docs] of Object.entries(packs)) zip.file(`packs/${name}.json`, JSON.stringify(docs))
  zip.file('packs/equipment_folders.json', '[]')
  const en: Record<string, any> = {}
  for (const [key, value] of Object.entries<string>(context.lang)) {
    const parts = key.split('.')
    let node = en
    for (const p of parts.slice(0, -1)) node = (node[p] ??= {})
    node[parts.at(-1)!] = value
  }
  zip.file('lang/en.json', JSON.stringify(en))
  return openReleaseZip(await zip.generateAsync({ type: 'uint8array' }))
}

const ALL = ['conditions', 'equipment', 'pathfinder-monster-core', 'spells', 'spell-effects']

describe('Foundry release sync', () => {
  beforeEach(async () => {
    await getDb().rules.clear()
    await getDb().syncState.clear()
  })

  it('identifies the release and classifies packs', async () => {
    const src = await releaseZip()
    expect(src.game).toBe('pf2e')
    expect(src.version).toBe('8.6.1')
    expect(src.packs.map(p => [p.name, p.group, p.defaultSelected])).toEqual([
      ['conditions', 'core', true], ['equipment', 'core', true], ['pathfinder-monster-core', 'bestiary', true],
      ['spell-effects', 'skip', false], ['spells', 'core', true],
    ])
  })

  it('imports everything once, then skips unchanged packs', async () => {
    const report = await runFoundrySync(await releaseZip(), { packs: ALL })
    const expected = pf2e('conditions').length + pf2e('equipment').length + pf2e('pathfinder-monster-core').length + pf2e('spells').length
    expect(report.created).toBe(expected)
    expect(await getDb().rules.count()).toBe(expected)
    expect(report.packs.find(p => p.name === 'spell-effects')).toBeUndefined()

    // Links in text resolve against the synced packs
    const goblin = await rulesGet('fvtt:pf2e:pathfinder-monster-core:fLLKuOXwPq1Iq0U4') as Creature
    expect(goblin.upstream).toMatchObject({ pack: 'pathfinder-monster-core', version: '8.6.1' })

    const again = await runFoundrySync(await releaseZip(), { packs: ALL })
    expect(again.packs.every(p => p.skipped)).toBe(true)
    expect(again.created + again.updated).toBe(0)

    const forced = await runFoundrySync(await releaseZip(), { packs: ALL, force: true })
    expect(forced.unchanged).toBe(expected)
    expect(forced.updated).toBe(0)
  })

  it('re-converts packs synced by an older converter, even at the same version and checksum', async () => {
    await runFoundrySync(await releaseZip(), { packs: ALL })
    const state = (await getDb().syncState.get('pf2e'))!
    expect(Object.values(state.packs).every(p => p.converter === CONVERTER_VERSION)).toBe(true)
    // A sync from before converter versions existed
    await getDb().syncState.put({ ...state, packs: Object.fromEntries(Object.entries(state.packs).map(([k, v]) => [k, { hash: v.hash, count: v.count }])) })
    const again = await runFoundrySync(await releaseZip(), { packs: ALL })
    expect(again.packs.some(p => p.skipped)).toBe(false)
    expect(again.created).toBe(0)
  })

  it('keeps user-owned fields and local edits, and reports conflicts', async () => {
    await runFoundrySync(await releaseZip(), { packs: ALL })
    const id = 'fvtt:pf2e:equipment-srd:LJdbVTOZog39EEbi'   // Longsword
    await rulesUpdate(id, 'img', 'data:image/png;base64,AAA')
    await rulesUpdate(id, 'gmNotes', 'The duke’s blade')
    await rulesUpdate(id, 'price', { cp: 999 })          // local edit
    await rulesUpdate(id, 'weapon.group', 'knife')        // local edit on an unchanged field

    const report = await runFoundrySync(await releaseZip(packs => {
      const sword = packs.equipment.find(d => d.name === 'Longsword')!
      sword.system.price = { value: { gp: 2 } }            // upstream price change
    }, '8.6.2'), { packs: ALL })

    expect(report.updated).toBe(1)
    expect(report.conflicts).toEqual([{ id, kind: 'item', name: 'Longsword', paths: ['price'] }])
    const raw = await getDb().rules.get(id) as Item
    expect(raw.price).toEqual({ cp: 200 })                 // upstream value stored
    expect(raw.img).toBe('data:image/png;base64,AAA')
    expect(raw.gmNotes).toBe('The duke’s blade')
    expect(raw.localEdits).toEqual({ price: { cp: 999 }, 'weapon.group': 'knife' })
    expect(((await rulesGet(id)) as Item).price).toEqual({ cp: 999 })   // effective value: the user's edit
    expect(raw.upstream?.version).toBe('8.6.2')
  })

  it('marks entries removed upstream instead of deleting them', async () => {
    await runFoundrySync(await releaseZip(), { packs: ALL })
    const report = await runFoundrySync(await releaseZip(packs => {
      packs.equipment = packs.equipment.filter(d => d.name !== 'Amethyst')
    }, '8.6.2'), { packs: ALL })
    expect(report.removed).toBe(1)
    const amethyst = await getDb().rules.get('fvtt:pf2e:equipment-srd:epTuWsVDuPzUXMk9')
    expect(amethyst?.upstream?.removed).toBe(true)
  })

  it('does not touch packs that were not selected', async () => {
    await runFoundrySync(await releaseZip(), { packs: ALL })
    const report = await runFoundrySync(await releaseZip(packs => { packs.spells = [] }, '8.6.2'), { packs: ['conditions'] })
    expect(report.removed).toBe(0)
    expect(await getDb().rules.where('kind').equals('spell').count()).toBe(pf2e('spells').length)
  })

  it('pairs legacy entries with their remaster version', async () => {
    const report = await runFoundrySync(await releaseZip(packs => {
      const legacy = structuredClone(packs.spells.find(d => d.name === 'Fireball')!)
      legacy._id = 'legacyFireball000'
      legacy._stats = { ...legacy._stats, compendiumSource: 'Compendium.pf2e.spells-srd.Item.legacyFireball000' }
      legacy.system.publication = { title: 'Core Rulebook', remaster: false, license: 'OGL' }
      packs.spells.push(legacy)
    }), { packs: ALL })
    expect(report.superseded).toBe(1)
    const legacy = await getDb().rules.get('fvtt:pf2e:spells-srd:legacyFireball000')
    expect(legacy?.supersededBy).toBe('fvtt:pf2e:spells-srd:sxQZ6yqTn0czJxVd')
  })

  it('rejects ZIPs that are not a Foundry release', async () => {
    const zip = new JSZip()
    zip.file('readme.txt', 'hi')
    await expect(openReleaseZip(await zip.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/packs\/ folder/)
  })
})
