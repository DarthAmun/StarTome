import { expect, test, type Page } from '@playwright/test'

/** Phase 7: Starfinder. A ship is built from a frame, crewed, taken into a battle on the sensor map, damaged through its shields and compromised. */

const base = (kind: string, name: string, extra: Record<string, unknown>) => ({
  id: `test:${kind}:${name}`, origin: 'user', kind, game: 'sf2e', name, sortName: name.toLowerCase(), level: 1, rarity: 'common', traits: [], description: '', sourceRefs: [],
  publication: { title: 'Test', remaster: true }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra,
})
const adv = [{ grade: 'commercial', level: 1, upgrades: 1, helmed: { ac: 1 } }]
const RULES = [
  base('starshipFrame', 'Explorer', { size: 'medium', sensorRange: 6, expansionBays: 2, customSlots: 1, defaultStations: [{ station: 'Pilot’s Console', upgrades: [] }, { station: 'Generator', upgrades: [] }], stats: [{ level: 1, hp: 60, sp: 15, ac: 16, fort: 6, ref: 8, will: 4, speed: 4 }] }),
  base('battleStation', 'Pilot’s Console', { advancement: adv, actions: [{ name: 'Evade', cost: 1, text: 'The pilot dodges.' }] }),
  base('battleStation', 'Generator', { advancement: adv, actions: [] }),
  base('battleStation', 'Gunnery', { advancement: adv, actions: [] }),
  base('starship', 'Pirate Cutter', { level: 2, size: 'medium', perception: 6, sensorRange: 5, skills: {}, abilities: {}, ac: 17, saves: { fort: 6, ref: 9, will: 5 }, hp: 40, shields: { max: 10, fortify: 3 }, immunities: [], weaknesses: [], resistances: [], speed: 4, battleStations: [], strikes: [], actions: [] }),
]

/** Puts a few starship entries straight into the compendium, as a Tech Core pack would. */
async function seedCompendium(page: Page) {
  await page.goto('/')
  await page.evaluate(async (rows) => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('startome-next'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise<void>((res, rej) => { const tx = db.transaction('rules', 'readwrite'); for (const row of rows) tx.objectStore('rules').put(row); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
    db.close()
  }, RULES)
  await page.reload()
}

test('a starship is built, crewed and fought: shields first, then the hull, then compromised', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await seedCompendium(page)
  await page.getByLabel('New campaign name').fill('Anvil')
  await page.getByLabel('Game').selectOption('sf2e')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByRole('link', { name: 'Party' }).click()
  await page.getByTestId('party-add').fill('Zo')
  await page.getByRole('button', { name: '+ PC' }).last().click()
  await expect(page.locator('[data-member="Zo"]')).toBeVisible()

  // The ship: from a frame, with a station of your choice and the crew seated
  await page.getByTestId('open-starship').click()
  await page.getByTestId('new-ship').click()
  await page.getByLabel('New starship name').fill('Sunrise')
  await page.getByLabel('New starship frame').selectOption({ label: 'Explorer (medium)' })
  await page.getByTestId('create-ship').click()
  await expect(page.getByTestId('ship-hp-max')).toHaveText('60')
  await expect(page.locator('[data-station="Pilot’s Console"]')).toContainText('commercial')
  await page.getByLabel('Station in slot 3').selectOption({ label: 'Gunnery' })
  await expect(page.locator('[data-station="Gunnery"]')).toBeVisible()
  await page.getByLabel('Station of Zo').selectOption({ label: '1 · Pilot’s Console' })
  await page.getByLabel('Activity of Zo').selectOption({ label: 'Fly the Ship' })
  await page.screenshot({ path: 'test-results/shots/starship-page.png' })

  // The interior: place the pilot's console, then a battle copies it and seats the pilot there
  await page.getByTestId('ship-interior').click()
  await expect(page.getByTestId('stations-panel')).toContainText('interior map')
  const box = await page.getByTestId('encounter-map').boundingBox()
  if (!box) throw new Error('no map')
  await page.locator('[data-place="1"]').click()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator('[data-station-row="Pilot’s Console"]')).toContainText('move')
  await page.getByRole('link', { name: 'Party' }).click()
  await page.getByTestId('open-starship').click()
  await page.getByTestId('ship-battle').click()
  await expect(page.getByTestId('stations-panel')).toContainText('battle')
  await expect(page.locator('[data-station-row="Pilot’s Console"]')).toContainText('Zo')
  await expect(page.getByTestId('stations-panel')).toContainText('AC 17')   // 16, +1 for the helmed console
  await expect(page.getByTestId('stations-panel')).toContainText('Fly the Ship')

  // The sensor map: an enemy arrives; damage to the party's ship takes the shields first
  await page.locator('[data-zone="9"]').click()
  await page.getByLabel('Add to the sensor map').fill('pirate')
  await page.locator('[data-add-ship="Pirate Cutter"]').click()
  await expect(page.locator('[data-ship="Pirate Cutter"]')).toBeVisible()
  await page.locator('[data-ship="Sunrise"]').click()
  await page.getByLabel('Starship damage amount').fill('20')
  await page.getByTestId('ship-damage').click()
  await expect(page.getByTestId('ship-hull')).toHaveText('55')
  await expect(page.getByLabel('Shield Points')).toHaveValue('0')
  await page.getByLabel('Starship damage amount').fill('80')
  await page.getByTestId('ship-damage').click()
  await expect(page.getByTestId('ship-hull')).toHaveText('0')
  await expect(page.getByTestId('sensor-selected')).toContainText('Compromised 1')
  await expect(page.getByTestId('hull-check')).toBeVisible()
  await page.screenshot({ path: 'test-results/shots/starship-battle.png' })

  // The players see the row of zones, their ship in numbers, the enemy without
  const players = await context.newPage()
  await players.goto('/#/player/encounter')
  await expect(players.getByTestId('player-sensor')).toContainText('Sunrise')
  await expect(players.getByTestId('player-sensor')).toContainText('0/60 HP')
  await expect(players.getByTestId('player-sensor')).toContainText('Pirate Cutter')
  await expect(players.getByTestId('player-sensor')).not.toContainText('40')
  await players.close()

  // The ship's sheet has what the battle did to it
  await page.getByRole('link', { name: 'Party' }).click()
  await page.getByTestId('open-starship').click()
  await expect(page.getByLabel('Hull Points')).toHaveValue('0')
  await expect(page.getByLabel('Compromised')).toHaveValue('1')
  expect(errors).toEqual([])
})
