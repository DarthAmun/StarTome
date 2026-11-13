/** A small campaign to try things on: a few linked entries, a session with a board, a party member and a prepared encounter. Made on request, never by itself. */
import { newId } from '@/domain/ids'
import { addCombatant, createEncounter } from '@/data/encounters'
import { createEntry, saveEntry } from '@/data/entries'
import { addCharacterFor } from '@/data/party'
import { createCampaign } from '@/data/repo'
import { addEdge, addPanel, createSession } from '@/data/sessions'

export async function createDemoCampaign(): Promise<string> {
  const c = await createCampaign({ id: newId(), name: 'Welcome to StarTome', description: 'A small campaign to try things on. Delete it whenever you like.', game: 'pf2e' })
  const entry = async (type: Parameters<typeof createEntry>[1], name: string, body: string, data: Record<string, unknown> = {}) => {
    const e = await createEntry(c.id, type, name)
    await saveEntry(e.id, { body, data })
    return e
  }
  await entry('location', 'Brindlemoor', 'A market town on the old road. {{npc: Mara Thistle}} keeps the inn; the {{faction: Lantern Wardens}} keep the peace.', { type: 'Town', discovery: 'visited' })
  await entry('faction', 'Lantern Wardens', 'The town watch, stretched thin since the bridge fell.\n\n> [!hidden]\n> Their captain takes coin from the smugglers.', { type: 'Watch' })
  await entry('npc', 'Mara Thistle', 'Innkeeper of the Gilded Goose in {{location: Brindlemoor}}. Knows everyone, owes half of them.', { title: 'Innkeeper', ancestry: 'Halfling' })
  const hero = await entry('npc', 'Sir Aldric', 'A knight errant with a debt to pay.', { class: 'Champion', ancestry: 'Human', level: '1' })
  await addCharacterFor(hero)
  await entry('quest', 'The Fallen Bridge', 'Find out who cut the ropes.\n\n- [ ] Talk to {{npc: Mara Thistle}}\n- [ ] Search the riverbank', { status: 'active', giver: { entryId: null, name: 'Lantern Wardens' } })
  await entry('random-table', 'Road encounters', 'What the road brings.', { die: 'd6', rows: [{ min: 1, max: 2, result: 'A merchant with a broken wheel' }, { min: 3, max: 4, result: 'Wardens on patrol' }, { min: 5, max: 5, result: 'Wolves, hungry' }, { min: 6, max: 6, result: 'Nothing but rain' }] })
  await entry('note', 'How this works', 'Write `{{` to link entries. A link opens beside what you are doing. **Ctrl+K** finds anything. Try the session board, the encounter and the Desk.')

  const enc = await createEncounter(c.id, 'Wolves at the ford')
  for (let i = 0; i < 3; i++) await addCombatant(enc.id, { x: 10 + i * 2, y: 4 + i, label: `Wolf ${i + 1}`, hp: { current: 24, max: 24, temp: 0 }, ac: 15 })

  const session = await createSession(c.id)
  const at = { campaignId: c.id, sessionId: session.id }
  const arrive = await addPanel({ ...at, kind: 'scene', x: 0, y: 0, title: 'Arriving in Brindlemoor', body: 'Rain, a crowded inn, and {{npc: Mara Thistle}} with news of the bridge.' })
  const clue = await addPanel({ ...at, kind: 'clue', x: 320, y: 0, title: 'Cut ropes', body: 'The ropes were cut from the town side.' })
  const fight = await addPanel({ ...at, kind: 'encounter', x: 0, y: 260, title: enc.name, attrs: { encounterId: enc.id } })
  await addPanel({ ...at, kind: 'random-table', x: 320, y: 260, title: 'Road encounters' })
  await addEdge(session.id, arrive.id, clue.id, 'plan')
  await addEdge(session.id, arrive.id, fight.id, 'plan')
  return c.id
}
