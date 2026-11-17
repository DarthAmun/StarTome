import { expect, test, type Page } from '@playwright/test'

/** FLOORS_PLAN.md step 2: floors on the game table. A floor is added, a token moved up through the menu and down the stairs. */

async function newEncounter(page: Page) {
  await page.goto('/')
  await page.getByLabel('New campaign name').fill('Tower')
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByRole('heading', { name: 'Tower' })).toBeVisible()
  await page.getByRole('link', { name: 'Encounters' }).click()
  await page.getByTestId('new-encounter').click()
  await expect(page.getByTestId('encounter-map').locator('canvas')).toBeVisible()
}

const floorName = (page: Page) => page.getByTestId('floor-current')
const menu = (page: Page) => page.getByTestId('map-menu')

test('floors: add one, move a token up from its menu, and take the stairs back down', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await newEncounter(page)
  const box = await page.getByTestId('encounter-map').boundingBox()
  if (!box) throw new Error('no map')
  // Without an image the engine fits 30 × 20 squares of 40 px (engine.fit): the middle of square c, r on screen
  const scale = Math.max(0.1, Math.min(4, Math.min(box.width / 1200, box.height / 800) * 0.95)), cell = 40 * scale
  const at = (c: number, r: number) => [box.x + (box.width - 1200 * scale) / 2 + (c + 0.5) * cell, box.y + (box.height - 800 * scale) / 2 + (r + 0.5) * cell] as const
  const [cx, cy] = at(12, 8)
  const [sx] = at(8, 8), [ax] = at(15, 8)
  const rightClick = async (x: number, y: number) => { await page.keyboard.press('Escape'); await page.mouse.click(x, y, { button: 'right' }) }

  await page.mouse.click(cx, cy, { button: 'right' })
  await page.getByTestId('menu-add-token').click()
  await page.getByLabel('Token name').fill('Kip')
  await page.getByTestId('quick-add-confirm').click()
  await expect(page.locator('[data-turn="Kip"]')).toBeVisible()

  // One floor: the bar only offers adding one
  await expect(floorName(page)).toHaveText('Floors')
  await floorName(page).click()
  await page.getByTestId('floor-add-above').click()
  await expect(floorName(page)).toHaveText('Floor 2')
  await expect(page.getByText('Map · Floor 2')).toBeVisible()

  // The players' window shows the GM's floor, or the one it is kept on
  const players = await context.newPage()
  await players.goto('/#/player/encounter')
  await expect(players.getByTestId('player-floor')).toHaveText('Floor 2')
  await page.getByTestId('floor-lock').click()
  await page.getByTestId('floor-down').click()
  await expect(floorName(page)).toHaveText('Ground floor')
  await expect(players.getByTestId('player-floor')).toHaveText('Floor 2')
  await page.getByTestId('floor-lock').click()
  await expect(players.getByTestId('player-floor')).toHaveText('Ground floor')
  await players.close()
  await page.getByTestId('floor-up').click()

  // Kip stands on the ground floor, not up here
  await rightClick(cx, cy)
  await expect(menu(page)).toContainText('Add creature here')
  await page.keyboard.press('Escape')
  await page.keyboard.press('PageDown')
  await expect(floorName(page)).toHaveText('Ground floor')
  await rightClick(cx, cy)
  await expect(menu(page)).toContainText('Kip')
  await page.getByTestId('menu-floor-up').click()
  await rightClick(cx, cy)
  await expect(menu(page)).toContainText('Add creature here')
  await page.keyboard.press('Escape')
  await page.getByTestId('floor-up').click()
  await expect(floorName(page)).toHaveText('Floor 2')
  await rightClick(cx, cy)
  await expect(menu(page)).toContainText('Kip')
  await expect(menu(page)).toContainText('Move down to Ground floor')
  await page.keyboard.press('Escape')

  // Stairs from Kip's square up here to a square on the ground floor
  await page.locator('[data-tool="stairs"]').click()
  await page.mouse.click(cx, cy)
  await expect(page.getByTestId('stairs-opts')).toContainText('One end on Floor 2')
  await page.keyboard.press('PageDown')
  await page.mouse.click(sx, cy)
  await expect(page.getByText('Stairs to Floor 2 placed.')).toBeVisible()
  await page.locator('[data-tool="select"]').click()
  await rightClick(sx, cy)
  await expect(menu(page)).toContainText('Stairs up')
  await page.keyboard.press('Escape')

  // Walking off the stairs and back onto them offers the way down
  await page.keyboard.press('PageUp')
  const drag = async (fx: number, tx: number) => { await page.mouse.move(fx, cy); await page.mouse.down(); await page.mouse.move(tx, cy, { steps: 5 }); await page.mouse.up() }
  await drag(cx, ax)
  await expect(page.getByTestId('stair-prompt')).toBeHidden()
  await drag(ax, cx)
  await expect(page.getByTestId('stair-prompt')).toContainText('Kip is on the stairs down to Ground floor')
  await page.getByTestId('stair-go').click()
  await expect(floorName(page)).toHaveText('Ground floor')
  await rightClick(sx, cy)
  await expect(menu(page)).toContainText('Kip')
  await page.keyboard.press('Escape')

  // Removing the floor above keeps Kip, who is down here now
  await page.getByTestId('floor-up').click()
  await floorName(page).click()
  await page.getByTestId('floor-remove').click()
  await page.getByRole('button', { name: 'Remove floor' }).click()
  await expect(floorName(page)).toHaveText('Floors')
  await expect(page.locator('[data-turn="Kip"]')).toBeVisible()
  expect(errors).toEqual([])
})

test('several map images become floors: order guessed from the names, fixed by hand, ground floor chosen', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await newEncounter(page)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
  const file = (name: string) => ({ name, mimeType: 'image/png', buffer: png })
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('choose-map').click()
  await (await chooser).setFiles([file('Tavern 2.png'), file('Tavern Cellar.png'), file('Tavern 1.png')])

  // Top floor first; the cellar goes under the ground floor
  const rows = page.getByTestId('floor-images').locator('li')
  await expect(rows).toHaveCount(3)
  expect(await rows.evaluateAll(list => list.map(li => li.getAttribute('data-row')))).toEqual(['Tavern 2.png', 'Tavern 1.png', 'Tavern Cellar.png'])
  await expect(page.getByLabel('Ground floor: Tavern 1.png')).toBeChecked()
  await expect(page.getByLabel('Floor name for Tavern Cellar.png')).toHaveAttribute('placeholder', 'Basement')
  await page.getByLabel('Floor name for Tavern 2.png').fill('Loft')
  await page.getByTestId('floor-images-apply').click()

  await expect(floorName(page)).toHaveText('Ground floor')
  const list = page.getByTestId('floor-list').locator('li')
  const names = () => list.evaluateAll(items => items.map(li => li.getAttribute('data-floor')))
  await expect.poll(names).toEqual(['Loft', 'Ground floor', 'Basement'])

  // Up one place: the basement goes above the ground floor
  await page.getByLabel('Move Basement up').click()
  await expect.poll(names).toEqual(['Loft', 'Basement', 'Ground floor'])
  await expect(page.getByLabel('Ground floor: Ground floor')).toBeChecked()
  // Another ground floor: the order stays, PgDn from the loft reaches the basement
  await page.getByLabel('Ground floor: Loft').check()
  await expect(page.getByLabel('Ground floor: Loft')).toBeChecked()
  await expect.poll(names).toEqual(['Loft', 'Basement', 'Ground floor'])
  await page.locator('[data-floor="Loft"] .name').click()
  await expect(floorName(page)).toHaveText('Loft')
  await page.keyboard.press('PageDown')
  await expect(floorName(page)).toHaveText('Basement')
  expect(errors).toEqual([])
})

test('the map maker paints two floors with stairs between them; the encounter gets both', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await newEncounter(page)
  await page.getByTestId('open-map-maker').click()
  const canvas = page.getByTestId('mm-canvas')
  await expect(canvas).toBeVisible()
  await page.keyboard.press('0')
  const box = (await canvas.boundingBox())!
  // The map maker fits its 24 × 18 squares with 32 px to spare on each side (editor.fit)
  const z = Math.min((box.width - 64) / 24, (box.height - 64) / 18)
  const mm = (c: number, r: number) => [box.x + (box.width - 24 * z) / 2 + (c + 0.5) * z, box.y + (box.height - 18 * z) / 2 + (r + 0.5) * z] as const
  const room = async () => { await page.mouse.move(...mm(8, 5)); await page.mouse.down(); await page.mouse.move(...mm(16, 12), { steps: 5 }); await page.mouse.up() }

  await room()
  await page.locator('[data-tool="brush"]').click()
  await page.locator('[data-tile="stairsup"]').click()
  await page.mouse.click(...mm(12, 9))
  await page.getByTestId('mm-floor-add-top').click()
  await expect(page.getByLabel('Floor name')).toHaveValue('Floor 2')
  await page.locator('[data-tile="wood"]').click()
  await page.locator('[data-tool="room"]').click()
  await room()
  await page.locator('[data-tool="brush"]').click()
  await page.locator('[data-tile="stairsdown"]').click()
  await page.mouse.click(...mm(12, 9))
  await page.getByLabel('Floor name').fill('Upstairs')
  await page.getByLabel('Floor name').press('Enter')
  // Each floor keeps its own undo: back on the ground floor nothing of the upper one is undone
  await page.keyboard.press('PageDown')
  await expect(page.getByTestId('mm-floors').locator('[data-floor="Upstairs"]')).toBeVisible()
  await page.keyboard.press('PageUp')
  await expect(page.getByLabel('Floor name')).toHaveValue('Upstairs')

  await page.getByTestId('mm-save').click()
  await expect(page.getByText(/Map saved with 2 floors, \d+ walls and doors, 1 stairs/)).toBeVisible()

  // On the encounter: both floors, the stairs where they were painted
  await expect(page.getByTestId('floor-current')).toHaveText('Ground floor')
  const map = (await page.getByTestId('encounter-map').boundingBox())!
  const s = Math.max(0.1, Math.min(4, Math.min(map.width / (24 * 70), map.height / (18 * 70)) * 0.95))
  const vtt = (c: number, r: number) => [map.x + (map.width - 24 * 70 * s) / 2 + (c + 0.5) * 70 * s, map.y + (map.height - 18 * 70 * s) / 2 + (r + 0.5) * 70 * s] as const
  // The view fits the map once its image has loaded: ask again until it has
  const menuAt = (text: string) => expect(async () => {
    await page.keyboard.press('Escape')
    await page.mouse.click(...vtt(12, 9), { button: 'right' })
    await expect(page.getByTestId('map-menu')).toContainText(text, { timeout: 500 })
  }).toPass()
  await menuAt('Stairs up')
  await page.keyboard.press('Escape')
  await page.getByTestId('floor-up').click()
  await expect(page.getByTestId('floor-current')).toHaveText('Upstairs')
  await menuAt('Stairs down')
  await page.keyboard.press('Escape')

  // Opened again, the map maker shows both floors to edit
  await page.getByTestId('floor-down').click()
  await page.getByTestId('open-map-maker').click()
  await expect(page.getByTestId('mm-floors').locator('[data-floor="Upstairs"]')).toBeVisible()
  await expect(page.getByLabel('Floor name')).toHaveValue('Ground floor')
  expect(errors).toEqual([])
})
