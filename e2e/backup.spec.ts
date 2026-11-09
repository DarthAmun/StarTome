import { expect, test, type Page } from '@playwright/test'
import { givePortrait, openSeeded, seededIds } from './helpers'

const TABLES = [
  'campaigns', 'entities', 'tokens', 'mapAssets', 'encounters', 'encounterTokens', 'encounterWalls',
  'entityLinks', 'entitySnapshots', 'entityConnections', 'graphLayouts',
  'characters', 'levelUps', 'xpAwards', 'treasureAwards', 'inventory', 'purses', 'starships', 'sessionPanels',
] as const

/** Rows per table, plus what a round trip has to keep: names, panel texts, the portrait's image bytes */
function snapshot(page: Page) {
  return page.evaluate(async (tables) => {
    const db = await new Promise<IDBDatabase>(res => { const rq = indexedDB.open('startome'); rq.onsuccess = () => res(rq.result) })
    const all = (s: string) => new Promise<any[]>(res => { const rq = db.transaction(s).objectStore(s).getAll(); rq.onsuccess = () => res(rq.result) })
    const counts: Record<string, number> = {}
    for (const t of tables) counts[t] = (await all(t)).length
    const entities = await all('entities')
    const attrsOf = (e: any) => (typeof e.attributes === 'string' ? JSON.parse(e.attributes) : e.attributes) ?? {}
    const aldric = entities.find(e => e.name === 'Aldric Vane')
    const ref: string | undefined = aldric && attrsOf(aldric).portraitSource
    const image = ref ? (await all('images')).find(i => `img:${i.id}` === ref) : undefined
    return {
      counts,
      names: entities.map(e => `${e.type}:${e.name}`).sort(),
      panels: (await all('sessionPanels')).map(p => p.content).sort(),
      portrait: ref ?? null,
      imageBytes: image ? (image.blob as Blob).size : 0,
    }
  }, TABLES as unknown as string[])
}

test('a full backup restores everything into an empty browser', async ({ page, browser }) => {
  // Source: the demo campaign, with an uploaded-style portrait (images travel inside the backup)
  await openSeeded(page)
  const { npcId } = await seededIds(page)
  await givePortrait(page, npcId)
  const before = await snapshot(page)
  expect(before.imageBytes).toBeGreaterThan(0)

  await page.goto('/#/data')
  const section = page.locator('.sett-section', { hasText: 'Full Backup' })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    section.getByRole('button', { name: '↓ Export' }).first().click(),
  ])
  const file = await download.path()

  // Target: a new profile that skips the demo campaign, so it starts truly empty
  const target = await browser.newContext()
  await target.addInitScript(() => localStorage.setItem('startome.seeded', '1'))
  const fresh = await target.newPage()
  await fresh.goto('/#/data')
  // The app creates its database; opening it before that would make an empty one in its way
  await expect.poll(() => fresh.evaluate(async () => (await indexedDB.databases()).some(d => d.name === 'startome' && (d.version ?? 0) > 1))).toBe(true)
  expect((await snapshot(fresh)).counts.campaigns).toBe(0)

  // Replace (the default for a full backup) asks first
  fresh.on('dialog', d => d.accept())
  await fresh.locator('input.data-file').setInputFiles(file)
  const dialog = fresh.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /^Import .* items$/ }).click()
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeVisible({ timeout: 30_000 })
  await dialog.getByRole('button', { name: 'Done' }).click()

  const after = await snapshot(fresh)
  expect(after.counts).toEqual(before.counts)
  expect(after.names).toEqual(before.names)
  expect(after.panels).toEqual(before.panels)
  // The portrait comes back as a stored image (a new id is fine), the same size
  expect(after.portrait).toMatch(/^img:/)
  expect(after.imageBytes).toBe(before.imageBytes)

  // And the app shows it
  await fresh.goto('/')
  await expect(fresh.getByText('Welcome to StarTome').first()).toBeVisible()
  await target.close()
})
