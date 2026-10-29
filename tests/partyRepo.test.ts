import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, parseRecordData } from '~/composables/useDb'
import { useEntities } from '~/composables/useEntities'
import { useParty } from '~/composables/useParty'

async function campaign(advancement: 'xp' | 'milestone') {
  const db = getDb()
  const id = await db.campaigns.add({ name: 'The Codex', description: '', game: 'pf2e', rules: { advancement }, created_at: '', updated_at: '' }) as number
  const npc = (name: string, attrs: Record<string, unknown>) =>
    db.entities.add({ campaign_id: id, type: 'npc', name, content: '', attributes: JSON.stringify(attrs) } as any) as Promise<number>
  const kib = await npc('Kib', { isPlayerCharacter: true, level: 'Level 5' })
  const lira = await npc('Lira', { isPlayerCharacter: true, level: '5' })
  const guard = await npc('Captain Vos', { level: '7' })
  return { id, kib, lira, guard }
}

describe('party repository', () => {
  beforeEach(async () => {
    const db = getDb()
    await Promise.all([db.campaigns.clear(), db.entities.clear(), db.characters.clear(), db.levelUps.clear()])
    useParty().dismissPrompt()
  })

  it('adopts PC-flagged NPCs once, with their level', async () => {
    const c = await campaign('milestone')
    const party = useParty()
    await party.load(c.id)
    expect(party.characters.value.map(x => [x.name, x.role, x.level])).toEqual([['Kib', 'pc', 5], ['Lira', 'pc', 5]])
    await party.load(c.id)
    expect(await getDb().characters.count()).toBe(2)
    expect(party.party.value).toMatchObject({ level: 5, size: 2, mixed: false })
  })

  it('adds a companion who counts only when treated as PC', async () => {
    const c = await campaign('milestone')
    const party = useParty()
    await party.load(c.id)
    await party.addCharacter({ campaignId: c.id, name: 'Captain Vos', role: 'companion', npcEntityId: c.guard })
    const vos = party.characters.value.find(x => x.name === 'Captain Vos')!
    expect(vos).toMatchObject({ level: 7, treatAsPc: false })
    expect(party.party.value.size).toBe(2)
    await party.updateCharacter(vos.id, { treatAsPc: true })
    expect(party.party.value).toMatchObject({ size: 3, level: 5, mixed: true, max: 7 })
  })

  it('levels up the selected members, mirrors the level to the NPC, and undoes', async () => {
    const c = await campaign('milestone')
    const party = useParty()
    await party.load(c.id)
    const [kib, lira] = party.characters.value
    const logId = await party.levelUp(c.id, [kib.id], 'manual')
    expect(party.characters.value.map(x => x.level)).toEqual([6, 5])
    expect(parseRecordData((await getDb().entities.get(c.kib))!.attributes).level).toBe('6')
    expect(party.levelUps.value[0].changes).toEqual([{ characterId: kib.id, from: 5, to: 6 }])

    await party.undoLevelUp(logId!)
    expect(party.characters.value.map(x => x.level)).toEqual([5, 5])
    expect(party.levelUps.value[0].undoneAt).toBeTruthy()
    expect(lira.level).toBe(5)
  })

  it('removing a PC clears its NPC flag so it is not adopted again', async () => {
    const c = await campaign('milestone')
    const party = useParty()
    await party.load(c.id)
    await party.removeCharacter(party.characters.value[0].id)
    await party.load(c.id)
    expect(party.characters.value.map(x => x.name)).toEqual(['Lira'])
  })

  it('asks to level up when a milestone quest is completed in a milestone campaign', async () => {
    for (const mode of ['milestone', 'xp'] as const) {
      const c = await campaign(mode)
      const entities = useEntities()
      await entities.loadAll(c.id)
      const quest = await entities.createEntity(c.id, 'quest', 'The Corruption')
      await entities.updateEntity(quest!.id, { attributes: { status: 'active', milestone: true } as any })
      expect(useParty().prompt.value).toBeNull()
      await entities.updateEntity(quest!.id, { attributes: { status: 'completed', milestone: true } as any })
      if (mode === 'milestone') expect(useParty().prompt.value).toMatchObject({ campaignId: c.id, trigger: 'quest', refId: quest!.id })
      else expect(useParty().prompt.value).toBeNull()
      useParty().dismissPrompt()
    }
  })
})
